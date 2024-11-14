// File: static/js/chat.js
$(document).ready(function() {
    // Assuming 'username' and 'color' are defined globally in your template
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
            // Validate file size (limit to 50MB)
            if (selectedFile.size > 60000 * 1024 * 1024) { // 60 gb limit
                alert('File size exceeds 60GB limit.');
                selectedFile = null;
                $('#message').val('');
                $('#file-input').val(''); // Clear the file input
                return;
            }

            // Show the progress bar
            $('#upload-progress').show();
            var progressBar = $('#upload-progress-bar');
            progressBar.css({
                'background': 'linear-gradient(90deg, #F36265 0%, #961276 100%)',
                'color': '#fff',
                'width': '0%',
                'text-align': 'center',
                'line-height': '20px',
                'height': '20px'
            }).text('0%');

            // Simulate progress up to 90%
            var progress = 0;
            var progressInterval = setInterval(function() {
                if (progress < 90) {
                    progress += Math.random() * 5; // Random increment up to 5%
                    if (progress > 90) progress = 90;
                    progressBar.css('width', progress + '%').text(Math.floor(progress) + '%');
                } else {
                    clearInterval(progressInterval);
                }
            }, 200); // Update every 200ms

            var reader = new FileReader();
            reader.onload = function(event) {
                var arrayBuffer = event.target.result;
                var blob = new Blob([arrayBuffer], { type: selectedFile.type });
                // Emit the send_file event with filename and binary data, with acknowledgment
                socket.emit('send_file', selectedFile.name, blob, function(response) {
                    // Clear the progress interval
                    clearInterval(progressInterval);
                    if (response.status === 'success') {
                        // Set progress to 100%
                        progressBar.css('width', '100%').text('100%');
                        // Hide the progress bar after a short delay
                        setTimeout(function() {
                            $('#upload-progress').hide();
                            progressBar.css('width', '0%').text('0%');
                        }, 500); // Adjust delay as needed

                        // Reset selectedFile and clear file input
                        selectedFile = null;
                        $('#file-input').val('');
                        $('#message').val(''); // Optionally clear the message input
                    } else {
                        // Handle failure
                        alert(response.msg || 'File upload failed.');
                        $('#upload-progress').hide();
                        progressBar.css('width', '0%').text('0%');

                        // Reset selectedFile and clear file input
                        selectedFile = null;
                        $('#file-input').val('');
                        $('#message').val(''); // Optionally clear the message input
                    }
                });
                // Do not hide the progress bar here; wait for server confirmation
            };

            reader.onerror = function() {
                alert('There was an error reading the file.');
                $('#upload-progress').hide();
                progressBar.css('width', '0%').text('0%');
                // Reset the selected file and message input
                selectedFile = null;
                $('#file-input').val('');
                $('#message').val('');
                clearInterval(progressInterval);
            };

            reader.onprogress = function(event) {
                // Removed direct progress updates to simulate progress instead
            };

            // Read the file as ArrayBuffer (binary)
            reader.readAsArrayBuffer(selectedFile);
        } else if (msg.trim().length > 0) {
            socket.emit('send_message', { 'msg': msg });
            $('#message').val('');
            // Ensure selectedFile is null when sending a text message
            selectedFile = null;
            $('#file-input').val('');
        }
    });

    // Handle receiving a file message
    socket.on('file_message', function(data) {
        var fileLink = '<a href="' + data.url + '" download="' + data.filename + '">Download</a>';
        var messageElement = '';

        if (data.type === 'file') {
            messageElement = '<div class="message"><span class="username" style="color:' + data.color + ';">' + data.username + ':</span> ' + data.filename + ' ' + fileLink + '</div>';
        }

        $('#messages').append(messageElement);
        $('#messages').scrollTop($('#messages')[0].scrollHeight);

        // The progress bar is managed via acknowledgment, no need to hide here
    });

    // Handle receiving regular messages and system messages
    socket.on('message', function(data) {
        var messageElement = '';

        if (data.type === 'system') {
            // Style system messages differently (e.g., italicized and gray color)
            messageElement = '<div class="message system-message"><span class="username" style="color:' + data.color + ';">' + data.username + ':</span> <em>' + data.msg + '</em></div>';
        } else if (data.type === 'message') {
            // Regular user messages
            messageElement = '<div class="message"><span class="username" style="color:' + data.color + ';">' + data.username + ':</span> ' + data.msg + '</div>';
        }

        $('#messages').append(messageElement);
        $('#messages').scrollTop($('#messages')[0].scrollHeight);

        // If the message is of type 'system' indicating an error during file upload, hide the progress bar
        if (data.type === 'system' && data.msg.startsWith('Failed')) {
            $('#upload-progress').hide();
            $('#upload-progress-bar').css('width', '0%').text('0%');
            alert(data.msg); // Optionally, alert the user about the error
        }
    });

    // Handle receiving message history
    socket.on('message_history', function(data) {
        $('#messages').empty();
        data.forEach(function(messageData) {
            var messageElement = '';
            if (messageData.type === 'file') {
                var fileLink = '<a href="' + messageData.url + '" download="' + messageData.filename + '">Download</a>';
                messageElement = '<div class="message"><span class="username" style="color:' + messageData.color + ';">' + messageData.username + ':</span> ' + messageData.filename + ' ' + fileLink + '</div>';
            } else if (messageData.type === 'system') {
                messageElement = '<div class="message system-message"><span class="username" style="color:' + messageData.color + ';">' + messageData.username + ':</span> <em>' + messageData.msg + '</em></div>';
            } else {
                messageElement = '<div class="message"><span class="username" style="color:' + messageData.color + ';">' + messageData.username + ':</span> ' + messageData.msg + '</div>';
            }
            $('#messages').append(messageElement);
        });
        $('#messages').scrollTop($('#messages')[0].scrollHeight);
    });

    // Handle receiving updated user list
    socket.on('user_list', function(data) {
        $('#users').empty();
        data.forEach(function(user) {
            $('#users').append('<li>' + user + '</li>');
        });
    });
});
