document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('access_token');
    const role = localStorage.getItem('user_role');
    if (!token) {
        window.location.href = './index.html';
        alert("Access denied. Please log in with appropriate credentials.");
        return;
    }
    if (role === 'analyst') {
        window.location.href = './home.html';
        alert("Access denied. Please log in with the appropriate role.");
        return;
    }

    const step1 = document.getElementById('step-1');
    const btnSingle = document.getElementById('btnSingle');
    const btnGroup = document.getElementById('btnGroup');
    const step2 = document.getElementById('step-2');
    const btnJourney = document.getElementById('btnJourney');
    const btnWatchdog = document.getElementById('btnWatchdog');
    const modal = document.getElementById('groupModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalDesc = document.getElementById('modalDesc');
    const nameInput = document.getElementById('personNameInput');
    const groupInput = document.getElementById('groupSizeInput');
    const btnCancel = document.getElementById('btnCancelGroup');
    const btnContinue = document.getElementById('btnContinueGroup');

    let isGroup = false;
    let tempName = "";
    let tempPeopleCount = 1;

    btnSingle.addEventListener('click', () => {
        isGroup = false;
        modalTitle.textContent = 'Single Report';
        modalDesc.textContent = 'Enter the name of the person';
        groupInput.style.display = 'none';
        nameInput.value = '';
        modal.style.display = 'flex';
        nameInput.focus();
    });

    btnGroup.addEventListener('click', () => {
        isGroup = true;
        modalTitle.textContent = 'Group Report';
        modalDesc.textContent = 'Enter group name and group size';
        groupInput.style.display = 'inline-block';
        nameInput.value = '';
        groupInput.value = '';
        modal.style.display = 'flex';
        nameInput.focus();
    });

    btnCancel.addEventListener('click', () => {
        modal.style.display = 'none';
    });

    btnContinue.addEventListener('click', () => {
        const nombre = nameInput.value.trim();
        let peopleCount = 1;

        if (nombre === "") {
            alert("Please enter a name.");
            return;
        }

        if (isGroup) {
            const size = parseInt(groupInput.value);
            if (isNaN(size) || size < 2) {
                alert("Please enter a valid group size (2 or more).");
                return;
            }
            peopleCount = size;
        }

        tempName = nombre;
        tempPeopleCount = peopleCount;

        modal.style.display = 'none';
        step1.style.display = 'none';
        step2.style.display = 'block';
    });

    function finalizarYGuardar(tipoEntrevista) {
        localStorage.removeItem('reporteBorrador');

        const nuevoBorrador = {
            group_id: crypto.randomUUID(),

            // Group / session meta
            group_name: tempName,
            people_count: tempPeopleCount,
            interviewType: tipoEntrevista,

            // Per-person accumulator — filled one-by-one in manual-report.js
            personas: [],
            currentPersonIndex: 0,

            // Shared media — filled in new-report.js
            photos: [],
            audios: [],
            positions: []
        };

        // Single person convenience: pre-seed name
        if (tempPeopleCount === 1) {
            nuevoBorrador.name = tempName;
        }

        localStorage.setItem('reporteBorrador', JSON.stringify(nuevoBorrador));
        window.location.href = 'new-report.html';
    }

    btnJourney.addEventListener('click', () => finalizarYGuardar('Journey'));
    btnWatchdog.addEventListener('click', () => finalizarYGuardar('Watchdog'));
});