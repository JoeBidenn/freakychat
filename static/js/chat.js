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
            // Validate file size (limit to 60GB)
            if (selectedFile.size > 60000 * 1024 * 1024) { // 60 GB limit
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

            // Initialize chunked upload
            uploadFileInChunks(selectedFile);

        } else if (msg.trim().length > 0) {
            socket.emit('send_message', { 'msg': msg });
            $('#message').val('');
            // Ensure selectedFile is null when sending a text message
            selectedFile = null;
            $('#file-input').val('');
        }
    });

    // Function to generate a unique file ID
    function generateFileId() {
        return 'xxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0,
                  v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    // Function to upload a file in chunks
    function uploadFileInChunks(file) {
        const chunkSize = 5 * 1024 * 1024; // 5MB per chunk
        const totalChunks = Math.ceil(file.size / chunkSize);
        const fileId = generateFileId();
        const filename = file.name;

        let currentChunk = 1;
        const maxRetries = 3; // Maximum retry attempts per chunk

        // Function to send a single chunk with retry logic
        function sendChunk(chunkNumber, retries = 0) {
            const start = (chunkNumber - 1) * chunkSize;
            const end = Math.min(file.size, start + chunkSize);
            const chunk = file.slice(start, end);

            const reader = new FileReader();
            reader.onload = function(e) {
                const arrayBuffer = e.target.result;
                const uint8Array = new Uint8Array(arrayBuffer);

                // Emit the chunk to the server
                socket.emit('send_file_chunk', {
                    file_id: fileId,
                    filename: filename,
                    total_chunks: totalChunks,
                    chunk_number: chunkNumber,
                    chunk_data: uint8Array
                });
            };

            reader.onerror = function(err) {
                console.error('Error reading file:', err);
                alert('There was an error reading the file.');
                resetUpload();
            };

            // Read the chunk as ArrayBuffer
            reader.readAsArrayBuffer(chunk);
        }

        // Function to reset upload UI and variables
        function resetUpload() {
            $('#upload-progress').hide();
            $('#upload-progress-bar').css('width', '0%').text('0%');
            selectedFile = null;
            $('#file-input').val('');
        }

        // Function to update the progress bar
        function updateProgressBar(percent) {
            var progressBar = $('#upload-progress-bar');
            progressBar.css('width', percent + '%').text(percent + '%');
        }

        // Listen for chunk acknowledgments
        socket.on('upload_chunk_received', function(data) {
            if (data.file_id === fileId) {
                console.log(`Chunk ${data.chunk_number} received by server.`);
                // Update progress
                const progress = Math.floor((data.chunk_number / totalChunks) * 100);
                updateProgressBar(progress);

                // Send next chunk if any
                if (currentChunk < data.chunk_number + 1 && data.chunk_number < totalChunks) {
                    currentChunk = data.chunk_number + 1;
                    sendChunk(currentChunk);
                }
            }
        });

        // Listen for upload completion
        socket.on('upload_complete', function(data) {
            if (data.file_id === fileId) {
                console.log(`File ${data.file_id} uploaded successfully: ${data.message}`);
                updateProgressBar(100);
                // Hide the progress bar after a short delay
                setTimeout(function() {
                    $('#upload-progress').hide();
                    $('#upload-progress-bar').css('width', '0%').text('0%');
                }, 500); // Adjust delay as needed

                // Reset selectedFile and clear file input
                selectedFile = null;
                $('#file-input').val('');
                $('#message').val(''); // Optionally clear the message input
            }
        });

        // Listen for upload errors
        socket.on('upload_error', function(data) {
            if (data.file_id === fileId) {
                console.error(`Error uploading file ${data.file_id}: ${data.message}`);
                alert('Error uploading file: ' + data.message);
                resetUpload();
            }
        });

        // Start uploading the first chunk
        sendChunk(currentChunk);
    }

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
