const list = document.getElementById('photo-list');
const BASE_URL = typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : '';
const getToken = () => localStorage.getItem('access_token');

const MAX_PHOTOS = 10;

// ─── DELETE a photo from Cloudinary + localStorage ───────────────────────────
async function deletePhoto(photoUrl, index) {
  const confirmDelete = confirm("Delete this photo?");
  if (!confirmDelete) return;

  try {
    const token = getToken();
    await fetch(`${BASE_URL}/api/delete-photo/`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ url: photoUrl })
    });
  } catch (err) {
    console.error("Error deleting from Cloudinary:", err);
    // Continue anyway — remove from local state regardless
  }

  // Remove from borrador
  let borrador = JSON.parse(localStorage.getItem('reporteBorrador')) || {};
  borrador.photo = borrador.photo || [];
  borrador.photo.splice(index, 1);
  localStorage.setItem('reporteBorrador', JSON.stringify(borrador));

  // Re-render
  loadPhotoReports();
}

// ─── Render photo list ────────────────────────────────────────────────────────
async function loadPhotoReports() {
  list.innerHTML = '';

  try {
    const borrador = JSON.parse(localStorage.getItem('reporteBorrador'));
    const photos = borrador?.photo || [];
    const count = photos.length;

    // Counter header
    const counter = document.createElement('p');
    counter.className = 'photo-counter';
    counter.textContent = `${count} / ${MAX_PHOTOS} photos`;
    list.appendChild(counter);

    // Add button visibility
    const addBtn = document.querySelector('.add-btn');
    if (addBtn) {
      if (count >= MAX_PHOTOS) {
        addBtn.disabled = true;
        addBtn.title = 'Maximum of 10 photos reached';
        addBtn.style.opacity = '0.4';
        addBtn.style.cursor = 'not-allowed';
      } else {
        addBtn.disabled = false;
        addBtn.title = '';
        addBtn.style.opacity = '';
        addBtn.style.cursor = '';
      }
    }

    if (count === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = 'No photo reports saved yet.';
      list.appendChild(empty);
      return;
    }

    photos.forEach((photo, index) => {
      const item = document.createElement('div');
      item.className = 'photo-item';
      item.innerHTML = `
        <div class="photo-info">
          <img src="${photo.image}" class="photo-thumbnail" alt="${photo.title || 'Photo'}">
          <div class="photo-meta">
            <p class="photo-title">${photo.title || 'Untitled'}</p>
            <p class="photo-date">${new Date(photo.timestamp).toLocaleString()}</p>
          </div>
          <button style="border: none; background: none; cursor: pointer;" class="delete-photo-btn" data-index="${index}" title="Delete photo">
          <i style="color: var(--primary); width: 200%;" class="fa-solid fa-trash"></i>
        </button>
        </div>
      `;
      list.appendChild(item);
    });

    // Attach delete listeners
    list.querySelectorAll('.delete-photo-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.index, 10);
        const borrador = JSON.parse(localStorage.getItem('reporteBorrador')) || {};
        const photoUrl = borrador.photo?.[idx]?.image;
        deletePhoto(photoUrl, idx);
      });
    });

  } catch (error) {
    console.error(error);
    list.innerHTML = '<p class="empty">Error loading photo reports.</p>';
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', loadPhotoReports);

document.querySelector('.add-btn').onclick = () => {
  const borrador = JSON.parse(localStorage.getItem('reporteBorrador')) || {};
  const count = (borrador.photo || []).length;
  if (count >= MAX_PHOTOS) {
    alert(`You've reached the maximum of ${MAX_PHOTOS} photos.`);
    return;
  }
  window.location.href = '/take-picture.html';
};