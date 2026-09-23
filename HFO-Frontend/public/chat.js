document.addEventListener('DOMContentLoaded', () => {

    const BASE_URL  = typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : '';
    const getToken  = () => localStorage.getItem('access_token');
    const POLL_MS   = 3000; // poll every 3 seconds

    const token = getToken();

    if (!token) {
        window.location.href = './index.html';
        alert("Access denied. Please log in with appropriate credentials.");
        return;
    }

    // ── Current user from JWT ─────────────────────────────────────────────────
    let currentUser = { id: null, username: '', role: '' };
    try {
        const payload = JSON.parse(atob(getToken().split('.')[1]));
        currentUser.id       = payload.user_id;
        currentUser.username = payload.username;
        currentUser.role     = payload.role;
    } catch (e) {
        window.location.href = 'index.html';
    }

    // ── State ─────────────────────────────────────────────────────────────────
    let activeRoom   = { type: 'global', userId: null, groupId: null, name: 'Global Chat' };
    let lastMsgId    = null;
    let pollTimer    = null;
    let allUsers     = [];
    let selectedGroupUsers = new Set();
    
    // ✨ SOLUCIÓN 1: Memoria caché persistente en LocalStorage para recordar los nombres de los grupos
    let groupNamesCache = JSON.parse(localStorage.getItem('chat_group_names') || '{}');
    let groupMembersCache = {};

    // ── DOM ───────────────────────────────────────────────────────────────────
    const roomList          = document.getElementById('roomList');
    const messagesContainer = document.getElementById('messagesContainer');
    const messagesLoading   = document.getElementById('messagesLoading');
    const messageInput      = document.getElementById('messageInput');
    const sendBtn           = document.getElementById('sendBtn');
    const chatTitle         = document.getElementById('chatTitle');
    const chatSubtitle      = document.getElementById('chatSubtitle');
    const chatAvatar        = document.getElementById('chatAvatar');
    
    const newDmBtn          = document.getElementById('newDmBtn');
    const userPicker        = document.getElementById('userPicker');
    const userSearch        = document.getElementById('userSearch');
    const userPickerList    = document.getElementById('userPickerList');
    const closeUserPicker   = document.getElementById('closeUserPicker');
    
    const newGroupBtn       = document.getElementById('newGroupBtn');
    const groupModal        = document.getElementById('groupModal');
    const groupNameInput    = document.getElementById('groupNameInput');
    const groupUserPickerList = document.getElementById('groupUserPickerList');
    const closeGroupModal   = document.getElementById('closeGroupModal');
    const submitGroupBtn    = document.getElementById('submitGroupBtn');

    const globalPreview     = document.getElementById('globalPreview');
    const globalUnread      = document.getElementById('globalUnread');

    // ── Helpers ───────────────────────────────────────────────────────────────

    function authHeaders() {
        return { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' };
    }

    function avatarInitials(name) {
        return name ? name.slice(0, 2).toUpperCase() : '??';
    }

    function roleColor(role) {
        const colors = { admin: '#c1121f', analyst: '#1849a9', volunteer: '#27ae60' };
        return colors[role] || '#888';
    }

    function formatTime(isoString) {
        const d = new Date(isoString);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    function formatDate(isoString) {
        const d    = new Date(isoString);
        const now  = new Date();
        const diff = Math.floor((now - d) / 86400000);
        if (diff === 0) return 'Today';
        if (diff === 1) return 'Yesterday';
        return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
    }

    function scrollToBottom(smooth = false) {
        messagesContainer.scrollTo({
            top: messagesContainer.scrollHeight,
            behavior: smooth ? 'smooth' : 'instant'
        });
    }

    function extractGroupName(room) {
        if (!room) return null;
        if (typeof room.name === 'string' && room.name.trim()) return room.name.trim();
        if (typeof room.room_name === 'string' && room.room_name.trim()) return room.room_name.trim();
        if (typeof room.group_name === 'string' && room.group_name.trim()) return room.group_name.trim();
        if (typeof room.display_name === 'string' && room.display_name.trim()) return room.display_name.trim();
        if (typeof room.title === 'string' && room.title.trim()) return room.title.trim();
        
        if (room.room && typeof room.room.name === 'string') return room.room.name.trim();
        if (room.room && typeof room.room.title === 'string') return room.room.title.trim();
        if (room.group && typeof room.group.name === 'string') return room.group.name.trim();
        
        return null;
    }

    function isNearBottom() {
        const { scrollTop, scrollHeight, clientHeight } = messagesContainer;
        return scrollHeight - scrollTop - clientHeight < 120;
    }

    // ── Render Message ────────────────────────────────────────────────────────

    function renderMessage(msg, isNew = false) {
        const isMine = msg.sender === currentUser.id || msg.sender_username === currentUser.username;

        const row = document.createElement('div');
        row.className  = `msg-row ${isMine ? 'mine' : 'theirs'}`;
        row.dataset.id = msg.id;

        const avatar = document.createElement('div');
        avatar.className   = 'msg-avatar';
        avatar.textContent = avatarInitials(msg.sender_username);
        avatar.style.background = roleColor(msg.sender_role);

        const body = document.createElement('div');
        body.className = 'msg-body';

        const meta = document.createElement('div');
        meta.className = 'msg-meta';
        meta.innerHTML = `
            <span class="msg-sender">${isMine ? 'You' : msg.sender_username}</span>
            <span style="color: var(--text-dark);">${formatTime(msg.timestamp)}</span>
        `;

        const bubble = document.createElement('div');
        bubble.className   = 'msg-bubble';
        bubble.textContent = msg.content;

        body.appendChild(meta);
        body.appendChild(bubble);

        if (isMine) {
            row.appendChild(body);
            row.appendChild(avatar);
        } else {
            row.appendChild(avatar);
            row.appendChild(body);
        }

        return row;
    }

    // ── Messages Logic ────────────────────────────────────────────────────────

    function renderMessages(messages) {
        messagesContainer.innerHTML = '';
        if (messages.length === 0) {
            messagesContainer.innerHTML = '<p style="text-align:center;color:var(--text-muted,#aaa);margin:auto;">No messages yet. Say hello!</p>';
            return;
        }

        let lastDate = null;
        messages.forEach(msg => {
            const dateLabel = formatDate(msg.timestamp);
            if (dateLabel !== lastDate) {
                const sep = document.createElement('div');
                sep.className   = 'date-separator';
                sep.textContent = dateLabel;
                messagesContainer.appendChild(sep);
                lastDate = dateLabel;
            }
            messagesContainer.appendChild(renderMessage(msg));
        });

        if (messages.length > 0) {
            lastMsgId = messages[messages.length - 1].id;
        }
        scrollToBottom();
    }

    function appendMessages(messages) {
        if (messages.length === 0) return;
        const wasNearBottom = isNearBottom();

        const placeholder = messagesContainer.querySelector('p');
        if (placeholder) placeholder.remove();

        messages = messages.filter(msg => !messagesContainer.querySelector(`[data-id="${msg.id}"]`));
        if (messages.length === 0) return;

        let lastDate = null;
        const separators = messagesContainer.querySelectorAll('.date-separator');
        if (separators.length > 0) {
            lastDate = separators[separators.length - 1].textContent;
        }

        messages.forEach(msg => {
            const dateLabel = formatDate(msg.timestamp);
            if (dateLabel !== lastDate) {
                const sep = document.createElement('div');
                sep.className   = 'date-separator';
                sep.textContent = dateLabel;
                messagesContainer.appendChild(sep);
                lastDate = dateLabel;
            }
            messagesContainer.appendChild(renderMessage(msg, true));
        });

        lastMsgId = messages[messages.length - 1].id;
        if (wasNearBottom) scrollToBottom(true);
    }

    // ── Load room (first fetch) ───────────────────────────────────────────────

    async function loadRoom() {
        clearInterval(pollTimer);
        lastMsgId = null;
        messagesContainer.innerHTML = '';
        messagesLoading.style.display = 'block';
        messagesContainer.appendChild(messagesLoading);

        try {
            let url;
            if (activeRoom.type === 'global') {
                url = `${BASE_URL}/api/chat/global/`;
            } else if (activeRoom.type === 'group') {
                url = `${BASE_URL}/api/chat/group/${activeRoom.groupId}/`;
            } else {
                url = `${BASE_URL}/api/chat/private/${activeRoom.userId}/`;
            }

            const res  = await fetch(url, { headers: authHeaders() });
            if (!res.ok) {
                messagesLoading.style.display = 'none';
                return;
            }

            const data = await res.json();
            messagesLoading.style.display = 'none';
            renderMessages(data.messages);

            // ── Actualización de la cabecera (UI Header) ──────────────────────
            if (activeRoom.type === 'global') {
                chatTitle.textContent    = 'Public Chat';
                chatSubtitle.textContent = 'All the staff members';
                chatAvatar.innerHTML     = '<i class="fa-solid fa-earth-europe"></i>';
                chatAvatar.style.background = '#1849a9';
            } 
            else if (activeRoom.type === 'group') {
                // Recuperar y persistir nombre
                const groupName = extractGroupName(data) || data.name || data.room_name || groupNamesCache[String(activeRoom.groupId)] || activeRoom.name || 'Group Chat';
                chatTitle.textContent = groupName;
                
                // Guardar en caché y en LocalStorage
                groupNamesCache[String(activeRoom.groupId)] = groupName;
                localStorage.setItem('chat_group_names', JSON.stringify(groupNamesCache));
                
                const sidebarItem = roomList.querySelector(`.room-item[data-id="${activeRoom.groupId}"], .room-item[data-group-id="${activeRoom.groupId}"]`);
                if (sidebarItem) {
                    const sidebarNameEl = sidebarItem.querySelector('.room-name');
                    if (sidebarNameEl) sidebarNameEl.textContent = groupName;
                }
                
                // OBTENER MIEMBROS - ESTRATEGIA MULTI-CAPA
                let uniqueNames = new Set();
                uniqueNames.add('Tú'); // Siempre estás tú

                // Capa 1: Intentar leer del objeto "data" directo de la sala
                let rawMembers = data.participants || data.members || data.users || 
                                 (data.room && (data.room.participants || data.room.members || data.room.users)) || [];

                // Capa 2: Si viene vacío, intentar buscar este grupo en la barra lateral/lista de conversaciones clonadas
                if ((!Array.isArray(rawMembers) || rawMembers.length === 0) && typeof rooms !== 'undefined') {
                    const foundGroupInList = rooms.find(r => String(r.id) === String(activeRoom.groupId));
                    if (foundGroupInList) {
                        rawMembers = foundGroupInList.participants || foundGroupInList.members || foundGroupInList.users || [];
                    }
                }

                // Procesar la lista de miembros encontrada (Capa 1 o Capa 2)
                if (Array.isArray(rawMembers) && rawMembers.length > 0) {
                    rawMembers.forEach(p => {
                        if (!p) return;
                        if (typeof p === 'number') {
                            const foundUser = allUsers.find(u => u.id === p);
                            if (foundUser && foundUser.username !== currentUser.username) uniqueNames.add(foundUser.username);
                        } else if (typeof p === 'string') {
                            const name = p.split(' ')[0];
                            if (name !== currentUser.username) uniqueNames.add(name);
                        } else if (typeof p === 'object') {
                            const name = p.username || p.first_name || p.user?.username || '';
                            if (name && name !== currentUser.username) uniqueNames.add(name);
                        }
                    });
                }

                // Capa 3: Escaneo de mensajes por si acaso
                if (data.messages && data.messages.length > 0) {
                    data.messages.forEach(msg => {
                        if (msg.sender_username && msg.sender_username !== currentUser.username) {
                            uniqueNames.add(msg.sender_username.split(' ')[0]);
                        }
                    });
                }

                // Convertir el Set a texto separado por comas
                let membersText = Array.from(uniqueNames).join(', ');
                
                // Si solo estás tú y el texto queda muy vacío, mostramos un fallback amigable
                if (uniqueNames.size <= 1) {
                    chatSubtitle.textContent = '👥 Miembros del grupo';
                } else {
                    chatSubtitle.textContent = `👥 ${membersText}`;
                }

                chatAvatar.innerHTML     = '<i class="fa-solid fa-users"></i>';
                chatAvatar.style.background = '#27ae60';
            }
            else {
                const other = data.other_user || { username: activeRoom.name, role: 'User' };
                chatTitle.textContent    = other.username;
                chatSubtitle.textContent = other.role;
                chatAvatar.textContent   = avatarInitials(other.username);
                chatAvatar.style.background = roleColor(other.role);
            }

            pollTimer = setInterval(pollNewMessages, POLL_MS);

        } catch (err) {
            console.error('Error loading room:', err);
            messagesLoading.style.display = 'none';
        }
    }

    // ── Polling & Sending ─────────────────────────────────────────────────────

    async function pollNewMessages() {
        try {
            let url = activeRoom.type === 'global' ? `${BASE_URL}/api/chat/global/?since=${lastMsgId || 0}` :
                      activeRoom.type === 'group'  ? `${BASE_URL}/api/chat/group/${activeRoom.groupId}/?since=${lastMsgId || 0}` :
                                                     `${BASE_URL}/api/chat/private/${activeRoom.userId}/?since=${lastMsgId || 0}`;

            const res  = await fetch(url, { headers: authHeaders() });
            const data = await res.json();

            if (data.messages && data.messages.length > 0) {
                appendMessages(data.messages);
                if (activeRoom.type === 'global') {
                    const last = data.messages[data.messages.length - 1];
                    globalPreview.textContent = `${last.sender_username}: ${last.content.slice(0, 28)}`;
                }
            }
        } catch (err) {
            console.error('Poll error:', err);
        }
    }

    async function sendMessage() {
        const content = messageInput.value.trim();
        if (!content) return;

        messageInput.value = '';
        messageInput.style.height = 'auto';
        sendBtn.disabled = true;

        try {
            let url = activeRoom.type === 'global' ? `${BASE_URL}/api/chat/global/send/` :
                      activeRoom.type === 'group'  ? `${BASE_URL}/api/chat/group/${activeRoom.groupId}/send/` :
                                                     `${BASE_URL}/api/chat/private/${activeRoom.userId}/send/`;

            const res = await fetch(url, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ content })
            });

            if (res.ok) {
                const msg = await res.json();
                appendMessages([msg]);
                lastMsgId = msg.id;
            } else {
                messageInput.value = content; 
            }
        } catch (err) {
            console.error('Send error:', err);
            messageInput.value = content;
        } finally {
            sendBtn.disabled = false;
            messageInput.focus();
        }
    }

    // ── Load conversations list ───────────────────────────────────────────────

    async function loadConversations() {
        try {
            const res   = await fetch(`${BASE_URL}/api/chat/conversations/`, { headers: authHeaders() });
            rooms = await res.json();

            let totalUnreadMessages = 0;
            roomList.querySelectorAll('.room-item[data-type="private"], .room-item[data-type="group"]').forEach(el => el.remove());

            rooms.forEach(room => {
                const isGroup = room.room_type === 'group' || room.type === 'group' || room.is_group;

                if (room.unread_count && room.unread_count > 0) {
                    totalUnreadMessages += room.unread_count;
                }

                let roomName = 'Unknown';
                let roomAvatarHTML = '';
                let roomSubtitleHTML = '';

                let lastMsg = 'No messages yet';
                if (room.last_message) {
                    const senderLabel = room.last_message.sender === currentUser.username ? 'You' : (room.last_message.sender_username || room.last_message.sender);
                    lastMsg = `${senderLabel}: ${room.last_message.content.slice(0, 24)}`;
                }

                if (isGroup) {
                    let extractedName = extractGroupName(room);
                    
                    // Verificamos en LocalStorage
                    if (!extractedName) {
                        extractedName = groupNamesCache[String(room.id)] || (room.room && groupNamesCache[String(room.room.id)]);
                    }
                    
                    if (!extractedName && activeRoom.type === 'group' && String(room.id) === String(activeRoom.groupId)) {
                        if (chatTitle.textContent && chatTitle.textContent !== 'Group Chat' && chatTitle.textContent !== 'Public Chat') {
                            extractedName = chatTitle.textContent;
                        }
                    }
                    
                    roomName = extractedName || 'Group Chat';
                    
                    // Si encontramos un nombre, lo persistimos en LocalStorage
                    if (roomName !== 'Group Chat') {
                        groupNamesCache[String(room.id)] = roomName;
                        localStorage.setItem('chat_group_names', JSON.stringify(groupNamesCache));
                    }

                    roomAvatarHTML = `<div class="room-avatar" style="background:#27ae60"><i class="fa-solid fa-users" style="font-size:0.8rem;"></i></div>`;
                    roomSubtitleHTML = `<span class="room-preview" style="display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${lastMsg}</span>`;
                } else {
                    if (room.other_user && room.other_user.username) {
                        roomName = room.other_user.username;
                    } else if (room.participants) {
                        const otherParticipant = room.participants.find(p => {
                            const name = typeof p === 'string' ? p.split(' ')[0] : p.username;
                            return name !== currentUser.username;
                        });
                        roomName = typeof otherParticipant === 'string' ? otherParticipant.split(' ')[0] : (otherParticipant?.username || 'Unknown');
                    }
                    const otherUserObj = allUsers.find(u => u.username === roomName) || room.other_user;
                    roomAvatarHTML = `<div class="room-avatar" style="background:${roleColor(otherUserObj?.role ?? '')}">${avatarInitials(roomName)}</div>`;
                    
                    roomSubtitleHTML = `<span class="room-preview" style="display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${lastMsg}</span>`;
                }

                const otherUserObj = allUsers.find(u => u.username === roomName) || room.other_user;
                const otherUserId  = room.other_user?.id ?? room.other_user_id ?? otherUserObj?.id ?? null;

                const item = document.createElement('div');
                item.className        = 'room-item';
                item.dataset.type     = isGroup ? 'group' : 'private';
                item.dataset.id       = room.id;
                if (!isGroup) item.dataset.userId = otherUserId;
                else item.dataset.groupId = room.id;

                item.innerHTML = `
                    ${roomAvatarHTML}
                    <div class="room-info" style="display: flex; flex-direction: column; justify-content: center; flex: 1; min-width: 0; padding-left: 4px;">
                        <span class="room-name" style="font-weight: 600; margin-bottom: 2px; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${roomName}</span>
                        ${roomSubtitleHTML}
                    </div>
                    ${room.unread_count > 0 ? `<span class="unread-badge">${room.unread_count}</span>` : ''}
                    <button class="remove-room-btn" title="Remove from list">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                `;

                item.addEventListener('click', (e) => {
                    if (isGroup) {
                        setActiveRoom('group', null, room.id, roomName);
                    } else {
                        const uid = parseInt(item.dataset.userId);
                        if (!uid) return;
                        setActiveRoom('private', uid, null, roomName);
                    }
                });

                const removeBtn = item.querySelector('.remove-room-btn');
                removeBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const confirmMsg = isGroup ? 'Leave and delete this group?' : 'Remove this conversation from preview?';
                    if (confirm(confirmMsg)) {
                        try {
                            const deleteUrl = isGroup 
                                ? `${BASE_URL}/api/chat/group/${room.id}/delete/`
                                : `${BASE_URL}/api/chat/conversations/${room.id}/`;
                            
                            const response = await fetch(deleteUrl, { method: 'DELETE', headers: authHeaders() });
                            if (response.ok) {
                                item.remove();
                                if ((isGroup && String(activeRoom.groupId) === String(room.id)) || (!isGroup && String(activeRoom.userId) === String(otherUserId))) {
                                    setActiveRoom('global');
                                }
                            }
                        } catch (err) {
                            console.error('Error removing conversation:', err);
                        }
                    }
                });

                roomList.appendChild(item);

                if (isGroup && activeRoom.type === 'group' && String(activeRoom.groupId) === String(room.id)) {
                    item.classList.add('active');
                } else if (!isGroup && activeRoom.type === 'private' && String(activeRoom.userId) === String(otherUserId)) {
                    item.classList.add('active');
                }
            });

            if (typeof window.updateChatBadge === 'function') {
                window.updateChatBadge(totalUnreadMessages);
            }

        } catch (err) {
            console.error('Error loading conversations:', err);
        }
    }
    
    // ── Load Users & Modals ───────────────────────────────────────────────────

    async function loadUsers() {
        try {
            const res = await fetch(`${BASE_URL}/api/chat/users/`, { headers: authHeaders() });
            allUsers  = await res.json();
            renderUserPicker(allUsers);
            renderGroupUserPicker(allUsers);
        } catch (err) {
            console.error('Error loading users:', err);
        }
    }

    function renderUserPicker(users) {
        userPickerList.innerHTML = '';
        users.forEach(user => {
            if (user.id === currentUser.id) return; 
            const item = document.createElement('div');
            item.className = 'user-picker-item';
            item.innerHTML = `
                <div class="room-avatar" style="background:${roleColor(user.role)};width:36px;height:36px;font-size:0.85rem;">${avatarInitials(user.username)}</div>
                <span style="font-size:0.9rem;color:var(--text-dark,#111);font-weight:500;">${user.username}</span>
                <span class="user-role-badge">${user.role}</span>
            `;
            item.addEventListener('click', () => {
                userPicker.style.display = 'none';
                setActiveRoom('private', user.id, null, user.username);
            });
            userPickerList.appendChild(item);
        });
    }

    function renderGroupUserPicker(users) {
        groupUserPickerList.innerHTML = '';
        users.forEach(user => {
            if (user.id === currentUser.id) return;
            const item = document.createElement('div');
            item.className = 'user-picker-item';
            item.style.justifyContent = 'flex-start';
            item.style.gap = '10px';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = user.id;
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) selectedGroupUsers.add(user.id);
                else selectedGroupUsers.delete(user.id);
            });

            item.innerHTML = `
                <div class="room-avatar" style="background:${roleColor(user.role)};width:30px;height:30px;font-size:0.75rem;">${avatarInitials(user.username)}</div>
                <span style="font-size:0.85rem;color:var(--text-dark,#111);flex:1;">${user.username}</span>
            `;
            item.prepend(checkbox);
            groupUserPickerList.appendChild(item);
        });
    }

    // ── Set active room ───────────────────────────────────────────────────────

    function setActiveRoom(type, userId = null, groupId = null, name = '') {
        activeRoom = { type, userId, groupId, name };

        roomList.querySelectorAll('.room-item').forEach(el => el.classList.remove('active'));
        if (type === 'global') {
            roomList.querySelector('[data-type="global"]').classList.add('active');
        } else if (type === 'group') {
            const target = roomList.querySelector(`.room-item[data-type="group"][data-id="${groupId}"]`);
            if (target) target.classList.add('active');
        } else {
            roomList.querySelectorAll('[data-type="private"]').forEach(el => {
                if (String(el.dataset.userId) === String(userId)) el.classList.add('active');
            });
        }

        loadRoom();
    }

    // ── Event listeners ───────────────────────────────────────────────────────

    roomList.querySelector('[data-type="global"]').addEventListener('click', () => {
        setActiveRoom('global');
    });

    sendBtn.addEventListener('click', sendMessage);

    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    messageInput.addEventListener('input', () => {
        messageInput.style.height = 'auto';
        messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
    });

    newDmBtn.addEventListener('click', () => {
        userPicker.style.display = 'flex';
        userPicker.style.flexDirection = 'column';
        userSearch.value = '';
        renderUserPicker(allUsers);
        userSearch.focus();
    });

    closeUserPicker.addEventListener('click', () => {
        userPicker.style.display = 'none';
    });

    userSearch.addEventListener('input', () => {
        const q       = userSearch.value.toLowerCase();
        const filtered = allUsers.filter(u => u.username.toLowerCase().includes(q));
        renderUserPicker(filtered);
    });

    newGroupBtn.addEventListener('click', () => {
        groupModal.style.display = 'flex';
        groupModal.style.flexDirection = 'column';
        groupNameInput.value = '';
        selectedGroupUsers.clear();
        renderGroupUserPicker(allUsers);
    });

    closeGroupModal.addEventListener('click', () => {
        groupModal.style.display = 'none';
    });

    submitGroupBtn.addEventListener('click', async () => {
        const name = groupNameInput.value.trim();
        if (!name) {
            alert('Please choose a group name.');
            return;
        }
        if (selectedGroupUsers.size === 0) {
            alert('Please select at least one user to add.');
            return;
        }

        try {
            const res = await fetch(`${BASE_URL}/api/chat/groups/create/`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({
                    name: name,
                    user_ids: Array.from(selectedGroupUsers)
                })
            });

            if (res.ok) {
                const newGroup = await res.json();
                groupModal.style.display = 'none';
                
                groupNamesCache[String(newGroup.id)] = newGroup.name || name;
                localStorage.setItem('chat_group_names', JSON.stringify(groupNamesCache));
                
                setActiveRoom('group', null, newGroup.id, newGroup.name || name);
                await loadConversations();
            } else {
                alert('Error creating group chat.');
            }
        } catch (err) {
            console.error('Group creation failure:', err);
        }
    });

    // ── Init ──────────────────────────────────────────────────────────────────

    // Nota: loadUsers() se ejecuta primero para tener allUsers cargado antes de que
    // loadRoom() o loadConversations() intenten traducir IDs numéricos a nombres.
    loadUsers().then(() => {
        loadConversations();
        loadRoom();
    });

    setInterval(loadConversations, 10000);
});