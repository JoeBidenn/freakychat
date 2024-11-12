import eventlet
eventlet.monkey_patch()

from flask import Flask, render_template, request, redirect, url_for, send_from_directory
from flask_socketio import SocketIO, emit
from flask_session import Session
import os
import base64
import uuid
from werkzeug.utils import secure_filename

app = Flask(__name__)
app.secret_key = 'your_secret_key'  # Replace with a secure random key

app.config['SESSION_TYPE'] = 'filesystem'
Session(app)

# Maximum file upload size (e.g., 10MB)
app.config['MAX_CONTENT_LENGTH'] = 10 * 1024 * 1024  # 10MB limit

socketio = SocketIO(app, async_mode='eventlet', manage_session=False)

# A set to keep track of connected users
connected_users = set()
# A dictionary to map usernames to colors
user_colors = {}
# Global list to store chat messages
message_history = []

# Upload folder
UPLOAD_FOLDER = 'uploads'
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# Removed ALLOWED_EXTENSIONS and allowed_file function since all file types are allowed

@app.route('/uploads/<filename>')
def uploaded_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

@app.route('/', methods=['GET', 'POST'])
def index():
    if request.method == 'POST':
        username = request.form['username']
        color = request.form['color']
        return redirect(url_for('chat', username=username, color=color))
    return render_template('index.html')

@app.route('/chat')
def chat():
    username = request.args.get('username')
    color = request.args.get('color')
    if not username or not color:
        return redirect(url_for('index'))
    return render_template('chat.html', username=username, color=color)

@socketio.on('connect')
def handle_connect():
    username = request.args.get('username')
    color = request.args.get('color')
    if username:
        connected_users.add(username)
        # Use the user's chosen color
        user_colors[username] = color
        # Emit the updated user list to all clients
        emit('user_list', list(connected_users), broadcast=True)
        # Notify all clients that the user has entered the chat
        enter_message = {
            'msg': f'{username} has entered the chat.',
            'username': username,
            'color': color
        }
        message_history.append(enter_message)  # Store the enter message
        emit('message', enter_message, broadcast=True)
        # Send the message history to the newly connected user
        emit('message_history', message_history, to=request.sid)

@socketio.on('disconnect')
def handle_disconnect():
    username = request.args.get('username')
    if username:
        connected_users.discard(username)
        emit('user_list', list(connected_users), broadcast=True)
        leave_message = {
            'msg': f'{username} has left the chat.',
            'username': username,
            'color': user_colors.get(username, '#000')
        }
        message_history.append(leave_message)  # Store the leave message
        emit('message', leave_message, broadcast=True)
        # Optionally remove the user's color mapping
        # user_colors.pop(username, None)

@socketio.on('send_message')
def handle_send_message(data):
    username = request.args.get('username')
    message = data['msg']
    color = user_colors.get(username, '#000')
    message_data = {
        'msg': message,
        'username': username,
        'color': color
    }
    # Store the message in the history
    message_history.append(message_data)
    # Emit the message to all clients
    emit('message', message_data, broadcast=True)

@socketio.on('send_file')
def handle_send_file(data):
    username = request.args.get('username')
    color = user_colors.get(username, '#000')
    filename = data['filename']
    file_data = data['data']

    # Since all file types are allowed, we proceed without checking the file extension

    # Decode the base64 data
    try:
        header, encoded = file_data.split(',', 1)
        file_bytes = base64.b64decode(encoded)
    except Exception as e:
        emit('message', {
            'msg': 'Invalid file data.',
            'username': 'System',
            'color': '#000'
        }, to=request.sid)
        return

    # Secure the filename
    secure_name = secure_filename(filename)
    # Generate a unique filename to prevent collisions
    unique_filename = str(uuid.uuid4()) + '_' + secure_name
    file_path = os.path.join(app.config['UPLOAD_FOLDER'], unique_filename)

    # Save the file
    with open(file_path, 'wb') as f:
        f.write(file_bytes)

    # Generate the file URL
    file_url = url_for('uploaded_file', filename=unique_filename)

    # Prepare the file message data
    file_message_data = {
        'filename': filename,
        'url': file_url,
        'username': username,
        'color': color
    }
    # Store the file message in the history
    message_history.append(file_message_data)
    # Emit the file message to all clients
    emit('file_message', file_message_data, broadcast=True)

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5000, debug=True)
