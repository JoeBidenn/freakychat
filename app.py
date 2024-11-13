import eventlet
eventlet.monkey_patch()

from flask import Flask, render_template, request, redirect, url_for, send_from_directory
from flask_socketio import SocketIO, emit
from flask_session import Session
import os
import base64
import uuid
import json
from werkzeug.utils import secure_filename
from datetime import datetime

app = Flask(__name__)
app.secret_key = 'your_secret_key'

app.config['SESSION_TYPE'] = 'filesystem'
Session(app)

app.config['MAX_CONTENT_LENGTH'] = 10 * 1024 * 1024

socketio = SocketIO(app, async_mode='eventlet', manage_session=False)

# Initialize global variables
connected_users = set()
user_colors = {}
message_history = []

# Path for chat history file
CHAT_HISTORY_FOLDER = 'data'  # Define the folder to store chat history
CHAT_HISTORY_FILE = os.path.join(CHAT_HISTORY_FOLDER, 'chat_history.json')
UPLOAD_FOLDER = 'uploads'

# Create necessary directories
for folder in [UPLOAD_FOLDER, CHAT_HISTORY_FOLDER]:
    if not os.path.exists(folder):
        os.makedirs(folder)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

def save_chat_history():
    """Save chat history to a JSON file"""
    try:
        with open(CHAT_HISTORY_FILE, 'w', encoding='utf-8') as f:
            # Add timestamp to each message if it doesn't exist
            for msg in message_history:
                if 'timestamp' not in msg:
                    msg['timestamp'] = datetime.now().isoformat()
            json.dump(message_history, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Error saving chat history: {e}")

def load_chat_history():
    """Load chat history from JSON file"""
    global message_history
    try:
        if os.path.exists(CHAT_HISTORY_FILE):
            with open(CHAT_HISTORY_FILE, 'r', encoding='utf-8') as f:
                message_history = json.load(f)
            print(f"Loaded {len(message_history)} messages from history")
        else:
            message_history = []
            print("No chat history file found, starting with empty history")
    except Exception as e:
        print(f"Error loading chat history: {e}")
        message_history = []

# Load chat history when server starts
load_chat_history()

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
        user_colors[username] = color
        emit('user_list', list(connected_users), broadcast=True)
        
        enter_message = {
            'msg': f'{username} has entered the chat.',
            'username': username,
            'color': color,
            'timestamp': datetime.now().isoformat(),
            'type': 'system'
        }
        message_history.append(enter_message)
        save_chat_history()  # Save after adding message
        
        emit('message', enter_message, broadcast=True)
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
            'color': user_colors.get(username, '#000'),
            'timestamp': datetime.now().isoformat(),
            'type': 'system'
        }
        message_history.append(leave_message)
        save_chat_history()  # Save after adding message
        
        emit('message', leave_message, broadcast=True)

@socketio.on('send_message')
def handle_send_message(data):
    username = request.args.get('username')
    message = data['msg']
    color = user_colors.get(username, '#000')
    
    message_data = {
        'msg': message,
        'username': username,
        'color': color,
        'timestamp': datetime.now().isoformat(),
        'type': 'message'
    }
    message_history.append(message_data)
    save_chat_history()  # Save after adding message
    
    emit('message', message_data, broadcast=True)

@socketio.on('send_file')
def handle_send_file(data):
    username = request.args.get('username')
    color = user_colors.get(username, '#000')
    filename = data['filename']
    file_data = data['data']

    try:
        header, encoded = file_data.split(',', 1)
        file_bytes = base64.b64decode(encoded)
    except Exception as e:
        emit('message', {
            'msg': 'Invalid file data.',
            'username': 'System',
            'color': '#000',
            'timestamp': datetime.now().isoformat(),
            'type': 'system'
        }, to=request.sid)
        return

    secure_name = secure_filename(filename)
    unique_filename = str(uuid.uuid4()) + '_' + secure_name
    file_path = os.path.join(app.config['UPLOAD_FOLDER'], unique_filename)
    
    with open(file_path, 'wb') as f:
        f.write(file_bytes)

    file_url = url_for('uploaded_file', filename=unique_filename)
    file_message_data = {
        'filename': filename,
        'url': file_url,
        'username': username,
        'color': color,
        'timestamp': datetime.now().isoformat(),
        'type': 'file'
    }
    message_history.append(file_message_data)
    save_chat_history()  # Save after adding message
    
    emit('file_message', file_message_data, broadcast=True)

# Removed the backup_chat_history and setup_periodic_backup functions to prevent clutter

if __name__ == '__main__':
    # setup_periodic_backup()  # Backup functionality removed
    socketio.run(app, host='0.0.0.0', port=5000, debug=True)
