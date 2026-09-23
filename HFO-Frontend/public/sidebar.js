document.addEventListener("DOMContentLoaded", () => {
    // ==========================================
    // --- VARIABLES Y ELEMENTOS DEL DOM ---
    // ==========================================
    const toggleBtn = document.getElementById('settings-btn');
    const settingsBox = document.getElementById('settings-box');
    const gear = document.getElementById('gear');
    const menuBtn = document.getElementById('menu-btn');
    const sideBar = document.getElementById('sideBar');
    const switchLD = document.getElementById('theme');
    const body = document.body;
    const userManagementLink = document.getElementById('nav-user-management');
    const token = localStorage.getItem('access_token');
    const BASE_URL = `${API_BASE_URL}`;
    // ==========================================
    // --- 1. CONTROL DE ROLES (PERMISOS) ---
    // ==========================================
    if (sideBar) {
        const userRole = localStorage.getItem('user_role');
        
        if (userRole === 'volunteer') {
            // Ocultamos múltiples elementos en bucle (más limpio)
            ['nav-database', 'nav-map', 'nav-dashboard', 'nav-user-management'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.display = 'none';
            });
        } else if (userRole !== 'admin') {
            const createReportLink = document.getElementById('nav-create');
            if (createReportLink) createReportLink.style.display = 'none';
            if (userManagementLink) userManagementLink.style.display = 'none';
        }
    }

    // ==========================================
    // --- 2. INICIALIZACIÓN MODO OSCURO ---
    // ==========================================
    const isDark = localStorage.getItem('darkMode') === 'true';
    if (isDark && switchLD) {
        switchLD.checked = true;
        body.classList.add('dark');
    }

    if (switchLD) {
        switchLD.addEventListener('change', (e) => {
            body.classList.toggle('dark', e.target.checked);
            localStorage.setItem('darkMode', e.target.checked);
        });
    }

    // ==========================================
    // --- 3. EVENT LISTENERS (MENÚS Y AJUSTES) ---
    // ==========================================

    // Botón de Settings
    if (toggleBtn && settingsBox) {
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // 🔴 EVITA EL BUG DEL DOBLE CLICK/BURBUJEO
            settingsBox.classList.toggle('active');
            if (gear) gear.classList.toggle('active'); // Gira el engranaje si tienes CSS para ello
        });
    }

    // Botón de la Sidebar Principal
    if (menuBtn && sideBar) {
        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // 🔴 EVITA EL BUG
            sideBar.classList.toggle('active');
            menuBtn.classList.toggle('dissapear');
            
            // UX Extra: Si cerramos la Sidebar, cerramos también Settings para que no quede abierto por detrás
            if (!sideBar.classList.contains('active') && settingsBox.classList.contains('active')) {
                settingsBox.classList.remove('active');
                if (gear) gear.classList.remove('active');
            }
        });
    }

    // El "Espía" Global: Cierra menús si haces clic fuera
    document.addEventListener('click', (e) => {
        // Cierra Settings si clicas fuera de su caja
        if (settingsBox && settingsBox.classList.contains('active')) {
            if (!settingsBox.contains(e.target)) {
                settingsBox.classList.remove('active');
                if (gear) gear.classList.remove('active');
            }
        }

        // Cierra la Sidebar si clicas fuera (en el resto de la página)
        if (sideBar && sideBar.classList.contains('active')) {
            if (!sideBar.contains(e.target)) {
                sideBar.classList.remove('active');
                if (menuBtn) menuBtn.classList.remove('dissapear');
                
                // Por seguridad, cerramos settings también
                if (settingsBox) settingsBox.classList.remove('active');
                if (gear) gear.classList.remove('active');
            }
        }
    });

    // ==========================================
    // --- 4. CONTROLADOR DEL MENÚ DE IDIOMAS ---
    // ==========================================
    const languageSelect = document.getElementById('language-select');

    function triggerGoogleTranslate(langCode) {
        const googleCombo = document.querySelector('.goog-te-combo');
        if (googleCombo) {
            googleCombo.value = langCode;
            googleCombo.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
            const options = googleCombo.options;
            for (let i = 0; i < options.length; i++) {
                if (options[i].value === langCode) {
                    options[i].selected = true;
                    break;
                }
            }
            return true;
        }
        return false;
    }

    if (languageSelect) {
        const savedLang = localStorage.getItem('appLang') || 'en';
        languageSelect.value = savedLang;

        if (savedLang !== 'en') {
            let intentos = 0;
            const intervalo = setInterval(() => {
                if (triggerGoogleTranslate(savedLang) || intentos > 15) {
                    clearInterval(intervalo);
                }
                intentos++;
            }, 100);
        }

        languageSelect.addEventListener('change', (e) => {
            const selectedLang = e.target.value;
            localStorage.setItem('appLang', selectedLang);

            if (selectedLang === 'en') {
                const hostParts = window.location.hostname.split('.');
                document.cookie = "googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
                for (let i = 0; i < hostParts.length; i++) {
                    const domainStr = hostParts.slice(i).join('.');
                    document.cookie = `googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; domain=${domainStr}; path=/;`;
                    document.cookie = `googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; domain=.${domainStr}; path=/;`;
                }
                window.location.reload();
            } else {
                if (!triggerGoogleTranslate(selectedLang)) {
                    console.error("No se pudo encontrar el widget de Google Translate");
                }
            }
        });
    }
    // ==========================================
// --- 5. MODAL DE PERFIL ---
// ==========================================
const profileRow = document.querySelector('.settings-row');
if (profileRow) {
  profileRow.addEventListener('click', () => {

    const username = localStorage.getItem('user_username') || 'User';
    const role = localStorage.getItem('user_role') || 'volunteer';
    //const dateJoined = localStorage.getItem('user_date_joined');

    // Nombre
    document.getElementById('profileUsername').textContent = username;

    // Fecha
    //if (dateJoined) {
    //  const fecha = new Date(dateJoined).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    //  document.getElementById('profileDate').textContent = fecha;
    //} else {
    //  document.getElementById('profileDate').textContent = 'Unknown';
    //}

    // Rol e icono
    const roleConfig = {
        admin: { 
          label: 'Administrator', 
          icon: 'fa-user-shield',
          perms: 'Full access to users and the database.' 
        },
        volunteer: { 
          label: 'Volunteer', 
          icon: 'fa-hand-holding-heart',
          perms: 'Uploading and editing testimonials.' 
        },
        analyst: { 
          label: 'Analyst', 
          icon: 'fa-magnifying-glass-chart',
          perms: 'Reading reports and generating graphs.' 
        }
      };
    const cfg = roleConfig[role] || roleConfig.volunteer;
    document.getElementById('profileRole').textContent = cfg.label;
    document.getElementById('profileIcon').className = `profile-role-icon fa-solid ${cfg.icon}`;
    document.getElementById('profilePermissions').textContent = cfg.perms;
    // Mostrar modal
    document.getElementById('profileModal').classList.add('active');
  });
}

// Cerrar con la cruz
const profileClose = document.getElementById('profileClose');
if (profileClose) {
  profileClose.addEventListener('click', () => {
    document.getElementById('profileModal').classList.remove('active');
  });
}

// --- LOGOUT ---
    window.logout = function() {
        localStorage.clear();
        window.location.href = './index.html';
    }

// ==========================================
    // --- 6. NOTIFICACIONES GLOBALES DE CHAT ---
    // ==========================================

    // Esta función controla el HTML de la bolita roja en el menú lateral
    window.updateChatBadge = function(unreadCount) {
        const badge = document.getElementById('chat-badge');
        if (!badge) return;

        if (unreadCount > 0) {
            badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    };

    function checkGlobalUnreadMessages() {
        const token = localStorage.getItem('access_token');
        if (!token) return;

        fetch(`${BASE_URL}/api/chat/conversations/`, { 
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
        })
        .then(res => res.json())
        .then(rooms => {
            let total = 0;
            rooms.forEach(room => {
                // Sumamos los mensajes no leídos de cada sala privada
                if (room.unread_count) total += room.unread_count;
            });
            // Llamamos a la función para actualizar la UI
            window.updateChatBadge(total);
        })
        .catch(err => console.log('Error checking notifications', err));
    }

    // Comprueba los mensajes nada más cargar la página
    checkGlobalUnreadMessages();
    
    // Y luego comprueba cada 30 segundos en segundo plano
    setInterval(checkGlobalUnreadMessages, 30000);



    if (!token) {
            console.warn("No hay token. Redirigiendo a login...");
            window.location.href = "/index.html"; // O la ruta a tu login
            return;
    }
}); // <-- Fin del DOMContentLoaded

