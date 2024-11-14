import eventlet
eventlet.monkey_patch()

from flask import Flask, render_template, request, redirect, url_for, send_from_directory
from flask_socketio import SocketIO, emit
from flask_session import Session
import os
import uuid
import json
from werkzeug.utils import secure_filename
from datetime import datetime
import logging

app = Flask(__name__)
app.secret_key = 'your_secret_key'

app.config['SESSION_TYPE'] = 'filesystem'
Session(app)

app.config['MAX_CONTENT_LENGTH'] = 60000 * 1024 * 1024  # 60 gb

# Updated SocketIO initialization with increased buffer size
MAX_BUFFER_SIZE = 60000 * 1000 * 1000  # 60 gb
socketio = SocketIO(app, async_mode='eventlet', manage_session=False, max_http_buffer_size=MAX_BUFFER_SIZE)

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

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

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
        logger.error(f"Error saving chat history: {e}")

def load_chat_history():
    """Load chat history from JSON file"""
    global message_history
    try:
        if os.path.exists(CHAT_HISTORY_FILE):
            with open(CHAT_HISTORY_FILE, 'r', encoding='utf-8') as f:
                message_history = json.load(f)
            logger.info(f"Loaded {len(message_history)} messages from history")
        else:
            message_history = []
            logger.info("No chat history file found, starting with empty history")
    except Exception as e:
        logger.error(f"Error loading chat history: {e}")
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
        emit('message_history', message_history, to=request.sid)
        
        # Emit system message for user entry
        enter_message = {
            'msg': f'{username} has entered the chat.',
            'username': 'System',
            'color': '#000',  # System messages can have a default color
            'timestamp': datetime.now().isoformat(),
            'type': 'system'
        }
        message_history.append(enter_message)
        save_chat_history()  # Save after adding message
        
        emit('message', enter_message, broadcast=True)

@socketio.on('disconnect')
def handle_disconnect():
    username = request.args.get('username')
    if username:
        connected_users.discard(username)
        emit('user_list', list(connected_users), broadcast=True)
        
        # Emit system message for user departure
        leave_message = {
            'msg': f'{username} has left the chat.',
            'username': 'System',
            'color': '#000',
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
def handle_send_file(filename, file_bytes):
    """
    Handles file uploads via Socket.IO.
    
    :param filename: Name of the uploaded file.
    :param file_bytes: Binary data of the uploaded file.
    """
    username = request.args.get('username')
    color = user_colors.get(username, '#000')

    if not username:
        username = 'Unknown'

    secure_name = secure_filename(filename)
    unique_filename = str(uuid.uuid4()) + '_' + secure_name
    file_path = os.path.join(app.config['UPLOAD_FOLDER'], unique_filename)
    
    try:
        with open(file_path, 'wb') as f:
            f.write(file_bytes)
    except Exception as e:
        logger.error(f"Error saving file: {e}")
        # Return failure status via acknowledgment
        return {'status': 'failure', 'msg': 'Failed to save the file.'}

    # Create file message
    file_url = url_for('uploaded_file', filename=unique_filename, _external=True)
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
    
    # Emit file_message
    emit('file_message', file_message_data, broadcast=True)

    # Return success status via acknowledgment
    return {'status': 'success'}

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5000, debug=True)
