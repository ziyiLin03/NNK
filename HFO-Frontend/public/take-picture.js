document.addEventListener('DOMContentLoaded', () => {
    // ⚙️ Variables Base
    const BASE_URL = typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : ''; 
    const getToken = () => localStorage.getItem('access_token');
    const MAX_PHOTOS = 10;

    // 📱 Elementos del DOM
    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');
    const preview = document.getElementById('photo');
    
    const takePhotoGrid = document.querySelector('.take-photo-grid');
    const photoGrid = document.getElementById('photo-grid');
    
    const btnCapture = document.getElementById('captureButton');
    const btnRetake = document.getElementById('retake-button');
    const btnSave = document.getElementById('save-button');
    const btnContinue = document.getElementById('continue-button'); 

    // Elementos del Modal
    const saveModal = document.getElementById('save-modal');
    const inputTitle = document.getElementById('dialog-title');
    const btnModalCancel = document.getElementById('modal-cancel');
    const btnModalSave = document.getElementById('modal-save');

    const btnSwitch = document.getElementById('switch-camera-btn');
    let isFrontCamera = false;

    let currentStream = null;
    let temporaryPhotoUrl = '';

    // ── Guard: redirect if already at max photos ──────────────────────────────
    function checkPhotoLimit() {
        const borrador = JSON.parse(localStorage.getItem('reporteBorrador')) || {};
        const numFotos = (borrador.photo || []).length;

        if (numFotos >= MAX_PHOTOS) {
            alert(`You've already reached the maximum of ${MAX_PHOTOS} photos.`);
            window.location.href = './camera.html';
            return true; // limit reached
        }
        return false;
    }

    if (checkPhotoLimit()) return;

    // Ocultar botón continue
    if (btnContinue) btnContinue.style.display = 'none';

    // 📷 1. Encender la cámara
    async function startCamera() {
        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
        }

        const facingMode = isFrontCamera ? 'user' : 'environment';

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: facingMode } 
            });
            currentStream = stream;
            video.srcObject = stream;

            if (isFrontCamera) {
                video.classList.add('mirror');
            } else {
                video.classList.remove('mirror');
            }
        } catch (err) {
            console.error("Error accediendo a la cámara:", err);
            alert("No se pudo acceder a la cámara. Revisa los permisos.");
        }
    }

    btnSwitch.addEventListener('click', () => {
        isFrontCamera = !isFrontCamera;
        startCamera();
    });

    startCamera();

    // 🚀 2. CAPTURAR Y SUBIR
    btnCapture.addEventListener('click', async () => {
        // Double-check limit before capturing
        if (checkPhotoLimit()) return;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');

        if (isFrontCamera) {
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
        }

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        if (isFrontCamera) {
            ctx.setTransform(1, 0, 0, 1, 0, 0);
        }

        const photoBase64 = canvas.toDataURL('image/jpeg', 0.8);
        if (isFrontCamera) {
            preview.classList.add('mirror');
        } else {
            preview.classList.remove('mirror');
        }

        preview.src = photoBase64;
        
        const textoOriginal = btnCapture.innerHTML;
        btnCapture.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uploading...';
        btnCapture.disabled = true;

        try {
            const token = getToken();
            const response = await fetch(`${BASE_URL}/api/upload-photo/`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}` 
                },
                body: JSON.stringify({ image: photoBase64 })
            });

            if (!response.ok) throw new Error("Server error");
            const data = await response.json();
            
            temporaryPhotoUrl = data.url; 

            takePhotoGrid.style.display = 'none';
            photoGrid.style.display = 'flex'; 

            btnCapture.innerHTML = textoOriginal;
            btnCapture.disabled = false;

        } catch (error) {
            console.error("Error uploading photo:", error);
            alert("Connection error. Please try again.");
            btnCapture.innerHTML = textoOriginal;
            btnCapture.disabled = false;
        }
    });

    // 🗑️ 3. REPETIR
    btnRetake.addEventListener('click', async () => {
        if (temporaryPhotoUrl) {
            const textoOriginal = btnRetake.innerHTML;
            btnRetake.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Deleting...';
            btnRetake.disabled = true;

            try {
                const token = getToken();
                await fetch(`${BASE_URL}/api/delete-photo/`, {
                    method: 'DELETE',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}` 
                    },
                    body: JSON.stringify({ url: temporaryPhotoUrl })
                });
            } catch (error) {
                console.error("Error deleting from server:", error);
            }
            
            btnRetake.innerHTML = textoOriginal;
            btnRetake.disabled = false;
        }

        temporaryPhotoUrl = '';
        
        photoGrid.style.display = 'none';
        takePhotoGrid.style.display = 'flex';
    });

    // 💾 4. ABRIR MODAL PARA GUARDAR
    btnSave.addEventListener('click', () => {
        inputTitle.value = ''; 
        saveModal.showModal(); 
    });

    // ❌ 5. CANCELAR MODAL
    btnModalCancel.addEventListener('click', () => {
        saveModal.close();
    });

    // ✅ 6. GUARDAR DEFINITIVO
    btnModalSave.addEventListener('click', () => {
        if (!temporaryPhotoUrl) return;

        let borrador = JSON.parse(localStorage.getItem('reporteBorrador')) || {};
        if (!borrador.photo) borrador.photo = [];

        // Final guard before saving
        if (borrador.photo.length >= MAX_PHOTOS) {
            alert(`Maximum of ${MAX_PHOTOS} photos reached. Delete one before adding more.`);
            saveModal.close();
            return;
        }

        const tituloFoto = inputTitle.value.trim() || 'Field Photo';

        borrador.photo.push({
            image: temporaryPhotoUrl,
            title: tituloFoto,
            timestamp: new Date().toISOString()
        });

        localStorage.setItem('reporteBorrador', JSON.stringify(borrador));

        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
        }

        saveModal.close();
        window.location.href = './camera.html'; 
    });
});