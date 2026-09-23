const modal = document.querySelector(".modal-overlay");
const openBtn = document.querySelector(".add-user-btn");
const closeBtn = document.querySelector(".close-modal");

const searchInput = document.querySelector(".search input");
const tableBody = document.querySelector(".user-table tbody");
const paginationDiv = document.querySelector(".pagination");
const deleteSelectedBtn = document.getElementById('delete-selected-btn');
const selectedCountSpan = document.getElementById('selected-count');

searchInput.setAttribute("readonly", true);
searchInput.addEventListener("focus", () => searchInput.removeAttribute("readonly"));

let users = [];
let currentPage = 1;
let totalPages = 1;
const ITEMS_PER_PAGE = 10;
let selectedUserIds = new Set();

// Tracks filter states uniformly
let currentFilter = {
    role: null,
    status: null,
    sortDate: null
};

// Función para obtener headers de autenticación
function getAuthHeaders() {
    const token = localStorage.getItem('access_token');
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };
}

// Función para decodificar JWT y obtener el rol
function getUserRoleFromToken() {
    const token = localStorage.getItem('access_token');
    if (!token) return null;
    
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map((c) => {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        
        const payload = JSON.parse(jsonPayload);
        return payload.role;
    } catch (error) {
        console.error('Error decodificando token:', error);
        return null;
    }
}

// ==========================================
// --- CENTRAL DATA PROCESSING ENGINE ---
// ==========================================
function getProcessedUsers() {
    let processed = [...users];
    
    // 1. Apply Live Text Search Filter
    if (searchInput && searchInput.value) {
        const value = searchInput.value.toLowerCase();
        processed = processed.filter(user => 
            (user.username && user.username.toLowerCase().includes(value)) || 
            (user.email && user.email.toLowerCase().includes(value))
        );
    }
    
    // 2. Apply Active Role Filters
    if (currentFilter.role) {
        processed = processed.filter(user => user.role === currentFilter.role);
    }
    
    // 3. Apply Active Status Filters
    if (currentFilter.status !== null) {
        const isActive = currentFilter.status === 'active';
        processed = processed.filter(user => user.is_active === isActive);
    }
    
    // 4. Apply Custom Layout Date Sorts
    if (currentFilter.sortDate) {
        processed.sort((a, b) => {
            const dateA = new Date(a.last_login || 0);
            const dateB = new Date(b.last_login || 0);
            return currentFilter.sortDate === 'asc' ? dateA - dateB : dateB - dateA;
        });
    }
    
    return processed;
}

// Cargar usuarios desde la API
async function loadUsers() {
    try {
        const token = localStorage.getItem('access_token');
        
        if (!token) {
            window.location.href = './index.html';
            alert("Access denied. Please log in with appropriate credentials.");
            return; 
        }

        const userRole = getUserRoleFromToken();
        
        if (userRole !== 'admin') {
            alert('Access denied. Only administrators can access user management.\n\nYour current role: ' + (userRole || 'unknown'));
            window.location.href = './home.html';
            return;
        }

        const url = `${API_BASE_URL}/api/users/`;
        
        const response = await fetch(url, {
            method: 'GET',
            headers: getAuthHeaders()
        });

        if (response.status === 403) {
            alert('Access denied. Only administrators can access user management.');
            window.location.href = './home.html';
            return;
        }

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('Error response:', response.status, errorData);
            throw new Error(`Error ${response.status}: ${errorData.detail || errorData.mensaje || JSON.stringify(errorData)}`);
        }

        users = await response.json();
        
        currentPage = 1;
        renderUsers();
    } catch (error) {
        console.error('Error al cargar usuarios:', error);
        alert('Error al cargar usuarios: ' + error.message);
    }
}

// Unified Single Table Render Engine
function renderUsers() {
    tableBody.innerHTML = '';
    const processedUsers = getProcessedUsers();
    
    totalPages = Math.ceil(processedUsers.length / ITEMS_PER_PAGE) || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const pageUsers = processedUsers.slice(startIndex, endIndex);
    
    if (pageUsers.length === 0) {
        const emptyRow = document.createElement('tr');
        emptyRow.innerHTML = '<td colspan="6" style="text-align:center;color:gray;">No users found</td>';
        tableBody.appendChild(emptyRow);
        
        const selectAllCheck = document.getElementById('select-all-checkbox');
        if (selectAllCheck) selectAllCheck.checked = false;
        
        updateSelectionUI();
        updatePagination();
        return;
    }
    
    const allSelected = pageUsers.length > 0 && pageUsers.every(u => selectedUserIds.has(String(u.id)));
    const selectAllCheck = document.getElementById('select-all-checkbox');
    if (selectAllCheck) selectAllCheck.checked = allSelected;
    
    pageUsers.forEach(user => {
        const row = document.createElement('tr');
        const userId = String(user.id);
        row.innerHTML = `
            <td><input type="checkbox" class="user-select-checkbox" data-id="${userId}" ${selectedUserIds.has(userId) ? 'checked' : ''}></td>
            <td>${user.username}</td>
            <td>${user.role}</td>
            <td class="status ${user.is_active ? 'active' : 'disabled'}">● ${user.is_active ? 'Active' : 'Disabled'}</td>
            <td>${user.last_login ? new Date(user.last_login).toLocaleDateString() : 'Never'}</td>
            <td>${user.force_password_change ? 'Pending' : 'Set'}</td>
        `;
        row.addEventListener('click', e => {
            if (!e.target.closest('.user-select-checkbox')) {
                openEditModal(user);
            }
        });
        tableBody.appendChild(row);
    });
    
    updateSelectionUI();
    updatePagination();
}

// Consolidated Dynamic Pagination Generator
function updatePagination() {
    paginationDiv.innerHTML = `
        <button class="pagination-btn prev-btn" ${currentPage <= 1 ? 'disabled' : ''}>
            <i class="fa-solid fa-arrow-left"></i> Prev
        </button>
        <span class="page-info">Page ${currentPage} of ${totalPages}</span>
        <button class="pagination-btn next-btn" ${currentPage >= totalPages ? 'disabled' : ''}>
            Next <i class="fa-solid fa-arrow-right"></i>
        </button>
    `;
    const prevBtn = paginationDiv.querySelector('.prev-btn');
    const nextBtn = paginationDiv.querySelector('.next-btn');
    
    prevBtn.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderUsers();
        }
    });
    
    nextBtn.addEventListener('click', () => {
        if (currentPage < totalPages) {
            currentPage++;
            renderUsers();
        }
    });
}

// ----------------------
// MODAL MANAGEMENT
// ----------------------
function openModal() {
    modal.style.display = "flex";
}

function closeModal() {
    modal.style.display = "none";
    resetModal();
}

function resetModal() {
    document.querySelector('.modal-header h2').textContent = 'Add User';
    document.querySelector('input[name="username"]').value = '';
    document.querySelector('select[name="role"]').value = 'volunteer';
    document.querySelector('.status-text').textContent = 'Active';
    document.querySelector('.status-text').className = 'status-text active';
    const emailInput = document.querySelector('input[name="email"]');
    if (emailInput) emailInput.value = '';
    const passwordInput = document.querySelector('input[name="password"]');
    if (passwordInput) passwordInput.value = '';
    
    const createdEl = document.querySelector('[data-date-type="created"]');
    const lastLoginEl = document.querySelector('[data-date-type="last-login"]');
    if (createdEl) createdEl.textContent = 'New User';
    if (lastLoginEl) lastLoginEl.textContent = 'Never';
}

openBtn.addEventListener("click", () => {
    resetModal();
    modal.dataset.mode = 'add';
    document.querySelector('.btn-delete').style.display = 'none';
    const passwordInput = document.querySelector('input[name="password"]');
    if (passwordInput) passwordInput.placeholder = 'Required for new users';
    openModal();
});

function openEditModal(user) {
    modal.dataset.mode = 'edit';
    modal.dataset.userId = user.id;
    modal.dataset.isActive = user.is_active;
    document.querySelector('.modal-header h2').textContent = 'Edit User';
    document.querySelector('.btn-delete').style.display = 'block';
    
    document.querySelector('input[name="username"]').value = user.username;
    const emailInput = document.querySelector('input[name="email"]');
    if (emailInput) emailInput.value = user.email || '';
    document.querySelector('select[name="role"]').value = user.role;
    document.querySelector('.status-text').textContent = user.is_active ? 'Active' : 'Disabled';
    document.querySelector('.status-text').className = `status-text ${user.is_active ? 'active' : 'disabled'}`;
    
    const passwordInput = document.querySelector('input[name="password"]');
    if (passwordInput) {
        passwordInput.value = '';
        passwordInput.placeholder = 'Leave empty to keep current';
    }
    
    updateSuspendButton();

    const createdDate = new Date().toLocaleDateString();
    let lastLoginDate = 'Never';
    
    if (user.last_login) {
        try {
            const dateObj = new Date(user.last_login);
            if (!isNaN(dateObj.getTime())) lastLoginDate = dateObj.toLocaleString();
        } catch (e) {}
    }
    
    const createdEl = document.querySelector('[data-date-type="created"]');
    const lastLoginEl = document.querySelector('[data-date-type="last-login"]');
    if (createdEl) createdEl.textContent = createdDate;
    if (lastLoginEl) lastLoginEl.textContent = lastLoginDate;
    
    openModal();
}

closeBtn.addEventListener("click", closeModal);
modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
});

// Live Search Hook Into Pipeline
searchInput.addEventListener("input", () => {
    currentPage = 1; 
    renderUsers();
});

// ----------------------
// SELECTION MANAGEMENT
// ----------------------
function updateSelectionUI() {
    const count = selectedUserIds.size;
    if (selectedCountSpan) selectedCountSpan.textContent = `${count} selected`;
    if (deleteSelectedBtn) deleteSelectedBtn.disabled = count === 0;
}

function toggleUserSelection(userId, checked) {
    const id = String(userId);
    if (checked) {
        selectedUserIds.add(id);
    } else {
        selectedUserIds.delete(id);
    }
    updateSelectionUI();
    renderUsers();
}

function handleSelectAll(checked) {
    const processedUsers = getProcessedUsers();
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const pageUsers = processedUsers.slice(startIndex, endIndex);
    
    pageUsers.forEach(user => {
        const id = String(user.id);
        if (checked) {
            selectedUserIds.add(id);
        } else {
            selectedUserIds.delete(id);
        }
    });
    updateSelectionUI();
    renderUsers();
}

async function deleteSelectedUsers() {
    if (selectedUserIds.size === 0) {
        alert('No users selected for deletion.');
        return;
    }

    if (!confirm(`Delete ${selectedUserIds.size} selected user(s)?`)) return;

    const userIds = Array.from(selectedUserIds);
    const results = await Promise.allSettled(
        userIds.map(id => 
            fetch(`${API_BASE_URL}/api/users/${id}/delete/`, {
                method: 'DELETE',
                headers: getAuthHeaders()
            }).then(res => {
                if (!res.ok) throw new Error(`Delete failed for user ${id}`);
            })
        )
    );

    const failed = results.filter(r => r.status === 'rejected');
    if (failed.length > 0) {
        console.warn('Some deletions failed:', failed);
        alert(`${failed.length} user(s) could not be deleted. Check console.`);
    } else {
        alert('Selected users were deleted successfully.');
    }

    selectedUserIds.clear();
    loadUsers();
}

// ----------------------
// MODAL CALLBACK ACTIONS
// ----------------------
const saveBtn = document.querySelector(".btn-save");
const suspendBtn = document.querySelector(".btn-suspend");
const deleteBtn = document.querySelector(".btn-delete");

saveBtn.addEventListener("click", async () => {
    const mode = modal.dataset.mode;
    const userId = modal.dataset.userId;
    
    const emailInput = document.querySelector('input[name="email"]');
    const passwordInput = document.querySelector('input[name="password"]');
    const isActive = modal.dataset.isActive === 'true';
    const data = {
        username: document.querySelector('input[name="username"]').value,
        email: emailInput ? emailInput.value : '',
        role: document.querySelector('select[name="role"]').value,
        is_active: isActive,
        force_password_change: document.querySelector('.force-pwd-checkbox')?.checked || false
    };
    if (passwordInput && passwordInput.value.trim()) {
        data.password = passwordInput.value;
    }
    
    if (mode === 'add' && (!passwordInput || !passwordInput.value.trim())) {
        alert('Password is required for new users.');
        return;
    }
    
    if (mode === 'add') {
        await createUser(data);
    } else if (mode === 'edit') {
        await updateUser(userId, data);
    }
});

suspendBtn.addEventListener("click", () => {
    const currentStatus = modal.dataset.isActive === 'true';
    modal.dataset.isActive = !currentStatus;
    updateSuspendButton();
});

function updateSuspendButton() {
    const isActive = modal.dataset.isActive === 'true';
    if (isActive) {
        suspendBtn.innerHTML = '<i class="fa-solid fa-ban"></i> Suspend User';
        suspendBtn.style.borderColor = 'var(--primary)';
        suspendBtn.style.color = 'var(--primary)';
    } else {
        suspendBtn.innerHTML = '<i class="fa-solid fa-check"></i> Enable User';
        suspendBtn.style.borderColor = '#28a745';
        suspendBtn.style.color = '#28a745';
    }
}

deleteBtn.addEventListener("click", async () => {
    const userId = modal.dataset.userId;
    if (userId) await deleteUser(userId);
});

// API Core Requests
async function createUser(data) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/users/create/`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            alert('Error al crear usuario: ' + JSON.stringify(error));
            return;
        }

        alert("Usuario creado exitosamente");
        closeModal();
        loadUsers();
    } catch (error) {
        alert('Error al crear usuario: ' + error.message);
    }
}

async function updateUser(id, data) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/users/${id}/update/`, {
            method: 'PATCH',
            headers: getAuthHeaders(),
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            alert('Error al actualizar usuario: ' + JSON.stringify(error));
            return;
        }

        alert("Usuario actualizado exitosamente");
        closeModal();
        loadUsers();
    } catch (error) {
        alert('Error al actualizar usuario: ' + error.message);
    }
}

async function deleteUser(id) {
    if (confirm("¿Estás seguro de que deseas eliminar este usuario? Esta acción no se puede deshacer.")) {
        try {
            const response = await fetch(`${API_BASE_URL}/api/users/${id}/delete/`, {
                method: 'DELETE',
                headers: getAuthHeaders()
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                alert('Error al eliminar usuario: ' + JSON.stringify(error));
                return;
            }

            alert("Usuario eliminado exitosamente");
            closeModal();
            loadUsers();
        } catch (error) {
            alert('Error al eliminar usuario: ' + error.message);
        }
    }
}

// ----------------------
// FILTER COMPONENT ACTIONS
// ----------------------
const filterRoleBtn = document.getElementById('filter-role');
if (filterRoleBtn) {
    filterRoleBtn.addEventListener('click', () => {
        const currentRole = currentFilter.role;
        const nextRole = currentRole === null ? 'volunteer' : 
                        currentRole === 'volunteer' ? 'analyst' : 
                        currentRole === 'analyst' ? 'admin' : null;
        
        currentFilter.role = nextRole;
        applyFilters();
        updateFilterButtonText('filter-role', nextRole ? nextRole.charAt(0).toUpperCase() + nextRole.slice(1) : 'Role');
    });
}

const filterStatusBtn = document.getElementById('filter-status');
if (filterStatusBtn) {
    filterStatusBtn.addEventListener('click', () => {
        const statuses = [null, 'active', 'disabled'];
        const currentStatus = currentFilter.status;
        const currentIndex = statuses.indexOf(currentStatus);
        const nextStatus = statuses[(currentIndex + 1) % statuses.length];
        
        currentFilter.status = nextStatus;
        applyFilters();
        updateFilterButtonText('filter-status', nextStatus ? (nextStatus === 'active' ? 'Active' : 'Disabled') : 'Status');
    });
}

const filterDateBtn = document.getElementById('filter-date');
if (filterDateBtn) {
    filterDateBtn.addEventListener('click', () => {
        currentFilter.sortDate = currentFilter.sortDate === null ? 'asc' : 
                                 currentFilter.sortDate === 'asc' ? 'desc' : null;
        applyFilters();
        updateFilterButtonText('filter-date', currentFilter.sortDate ? (currentFilter.sortDate === 'asc' ? 'Date ↑' : 'Date ↓') : 'Date');
    });
}

function applyFilters() {
    currentPage = 1; // Resets pagination to initial page cleanly upon any toggled state
    renderUsers();
}

function updateFilterButtonText(buttonId, text) {
    const btn = document.getElementById(buttonId);
    if (btn) {
        const icon = btn.querySelector('i');
        btn.innerHTML = icon.outerHTML + ' ' + text;
    }
}

// --- LOGOUT ---
window.logout = function() {
    localStorage.clear();
    window.location.href = './index.html';
}

// Global Initialization Listeners
document.addEventListener('DOMContentLoaded', () => {
    loadUsers();
    
    tableBody.addEventListener('change', e => {
        const checkbox = e.target.closest('.user-select-checkbox');
        if (!checkbox) return;
        const userId = checkbox.dataset.id;
        if (userId) toggleUserSelection(userId, checkbox.checked);
    });
    
    document.addEventListener('change', e => {
        if (e.target && e.target.id === 'select-all-checkbox') {
            handleSelectAll(e.target.checked);
        }
    });
    
    if (deleteSelectedBtn) {
        deleteSelectedBtn.addEventListener('click', deleteSelectedUsers);
    }
});