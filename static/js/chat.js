// File: static/js/chat.js
$(document).ready(function() {
    var socket = io({
        query: {
            username: username,
            color: color
        }
    });

    socket.on('connect', function() {
        console.log('Connected to server');
    });

    var selectedFile = null;

    // Handle file selection
    $('#file-input').change(function(event) {
        selectedFile = event.target.files[0];
        if (selectedFile) {
            // Optionally, display the file name in the message input
            $('#message').val(selectedFile.name);
        }
    });

    $('#message-form').submit(function(e) {
        e.preventDefault();
        var msg = $('#message').val();

        if (selectedFile) {
            // Validate file size (e.g., limit to 5MB)
            if (selectedFile.size > 5 * 1024 * 1024) {
                alert('File size exceeds 5MB limit.');
                selectedFile = null;
                $('#message').val('');
                return;
            }

            var reader = new FileReader();
            reader.onload = function(evt) {
                var fileData = evt.target.result;
                socket.emit('send_file', {
                    filename: selectedFile.name,
                    data: fileData
                });
                selectedFile = null;
                $('#message').val('');
            };
            reader.readAsDataURL(selectedFile);
        } else if (msg.trim().length > 0) {
            socket.emit('send_message', { 'msg': msg });
            $('#message').val('');
        }
    });

    // Handle receiving a file message
    socket.on('file_message', function(data) {
        var fileLink = '<a href="' + data.url + '" download="' + data.filename + '">Download</a>';
        var messageElement = '<div class="message"><span class="username" style="color:' + data.color + ';">' + data.username + ':</span> ' + data.filename + ' ' + fileLink + '</div>';
        $('#messages').append(messageElement);
        $('#messages').scrollTop($('#messages')[0].scrollHeight);
    });

    // Existing code for handling text messages and message history
    socket.on('message', function(data) {
        var messageElement = '<div class="message"><span class="username" style="color:' + data.color + ';">' + data.username + ':</span> ' + data.msg + '</div>';
        $('#messages').append(messageElement);
        $('#messages').scrollTop($('#messages')[0].scrollHeight);
    });

    socket.on('message_history', function(data) {
        $('#messages').empty();
        data.forEach(function(messageData) {
            var messageElement = '';
            if (messageData.url) {
                var fileLink = '<a href="' + messageData.url + '" download="' + messageData.filename + '">Download</a>';
                messageElement = '<div class="message"><span class="username" style="color:' + messageData.color + ';">' + messageData.username + ':</span> ' + messageData.filename + ' ' + fileLink + '</div>';
            } else {
                messageElement = '<div class="message"><span class="username" style="color:' + messageData.color + ';">' + messageData.username + ':</span> ' + messageData.msg + '</div>';
            }
            $('#messages').append(messageElement);
        });
        $('#messages').scrollTop($('#messages')[0].scrollHeight);
    });

    socket.on('user_list', function(data) {
        $('#users').empty();
        data.forEach(function(user) {
            $('#users').append('<li>' + user + '</li>');
        });
    });
});
