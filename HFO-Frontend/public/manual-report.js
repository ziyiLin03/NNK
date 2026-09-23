document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('access_token');
    if (!token) {
        window.location.href = './index.html';
        alert("Access denied. Please log in with appropriate credentials.");
        return;
    }
    const role = localStorage.getItem('user_role');
    if (role === 'analyst') {
        window.location.href = './home.html';
        alert("Access denied. Please log in with the appropriate role.");
        return;
    }

    const countries = [
        "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Antigua and Barbuda", "Argentina", "Armenia", "Australia", "Austria",
        "Azerbaijan", "Bahamas", "Bahrain", "Bangladesh", "Barbados", "Belarus", "Belgium", "Belize", "Benin", "Bhutan", "Bolivia",
        "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei", "Bulgaria", "Burkina Faso", "Burundi", "Cabo Verde", "Cambodia",
        "Cameroon", "Canada", "Central African Republic", "Chad", "Chile", "China", "Colombia", "Comoros", "Congo", "Costa Rica",
        "Croatia", "Cuba", "Cyprus", "Czechia", "Denmark", "Djibouti", "Dominica", "Dominican Republic", "Ecuador", "Egypt",
        "El Salvador", "Equatorial Guinea", "Eritrea", "Estonia", "Eswatini", "Ethiopia", "Fiji", "Finland", "France", "Gabon",
        "Gambia", "Georgia", "Germany", "Ghana", "Greece", "Grenada", "Guatemala", "Guinea", "Guinea-Bissau", "Guyana", "Haiti",
        "Honduras", "Hungary", "Iceland", "India", "Indonesia", "Iran", "Iraq", "Ireland", "Israel", "Italy", "Jamaica", "Japan",
        "Jordan", "Kazakhstan", "Kenya", "Kiribati", "Korea (North)", "Korea (South)", "Kosovo", "Kuwait", "Kyrgyzstan", "Laos",
        "Latvia", "Lebanon", "Lesotho", "Liberia", "Libya", "Liechtenstein", "Lithuania", "Luxembourg", "Madagascar", "Malawi",
        "Malaysia", "Maldives", "Mali", "Malta", "Marshall Islands", "Mauritania", "Mauritius", "Mexico", "Micronesia", "Moldova",
        "Monaco", "Mongolia", "Montenegro", "Morocco", "Mozambique", "Myanmar", "Namibia", "Nauru", "Nepal", "Netherlands",
        "New Zealand", "Nicaragua", "Niger", "Nigeria", "North Macedonia", "Norway", "Oman", "Pakistan", "Palau", "Palestine",
        "Panama", "Papua New Guinea", "Paraguay", "Peru", "Philippines", "Poland", "Portugal", "Qatar", "Romania", "Russia",
        "Rwanda", "Saint Kitts and Nevis", "Saint Lucia", "Saint Vincent", "Samoa", "San Marino", "Sao Tome and Principe",
        "Saudi Arabia", "Senegal", "Serbia", "Seychelles", "Sierra Leone", "Singapore", "Slovakia", "Slovenia", "Solomon Islands",
        "Somalia", "South Africa", "South Sudan", "Spain", "Sri Lanka", "Sudan", "Suriname", "Sweden", "Switzerland", "Syria",
        "Taiwan", "Tajikistan", "Tanzania", "Thailand", "Timor-Leste", "Togo", "Tonga", "Trinidad and Tobago", "Tunisia", "Turkey",
        "Turkmenistan", "Tuvalu", "Uganda", "Ukraine", "United Arab Emirates", "United Kingdom", "United States", "Uruguay",
        "Uzbekistan", "Vanuatu", "Vatican City", "Venezuela", "Vietnam", "Yemen", "Zambia", "Zimbabwe"
    ];

    const selectNationality = document.getElementById('nationality');
    countries.forEach(country => {
        const option = document.createElement('option');
        option.value = country;
        option.textContent = country;
        selectNationality.appendChild(option);
    });

    const inputName           = document.getElementById('name');
    const form                = document.getElementById('formTextos');
    const inputYears          = document.getElementById('years');
    const selectGender        = document.getElementById('gender');
    const inputNationality    = document.getElementById('nationality');
    const inputDesc           = document.getElementById('description');
    const selectVulnerability = document.getElementById('vulnerability_type');
    const selectLegal         = document.getElementById('legal_situation');

    const borrador           = JSON.parse(localStorage.getItem('reporteBorrador') || '{}');
    const peopleCount        = borrador.people_count || 1;
    const currentPersonIndex = borrador.currentPersonIndex || 0;
    const isGroup            = peopleCount > 1;

    // Contador de palabras en tiempo real
const wordCounter = document.createElement('small');
wordCounter.style.cssText = 'display:block; text-align:right; color:#666; margin-top:4px;';
inputDesc.parentNode.appendChild(wordCounter);

function updateWordCount() {
    const count = inputDesc.value.trim() === '' ? 0 
        : inputDesc.value.trim().split(/\s+/).filter(w => w.length > 0).length;
    wordCounter.textContent = `${count} / 250 words`;
    wordCounter.style.color = count > 250 ? '#c1121f' : '#666';
}
inputDesc.addEventListener('input', updateWordCount);
updateWordCount();

    // Progress banner for group mode
    if (isGroup) {
        const progressBanner = document.createElement('div');
        progressBanner.id = 'groupProgressBanner';
        progressBanner.style.cssText = [
            'background:#f0f4ff',
            'border-left:4px solid #4a6cf7',
            'padding:10px 16px',
            'margin-bottom:16px',
            'border-radius:4px',
            'font-size:14px',
            'font-weight:500',
            'color:#333'
        ].join(';');
        progressBanner.textContent = 'Person ' + (currentPersonIndex + 1) + ' of ' + peopleCount + ' — Group: "' + borrador.group_name + '"';
        form.parentNode.insertBefore(progressBanner, form);
    }

    // Pre-fill if re-visiting this slot
    const existingPersona = (borrador.personas || [])[currentPersonIndex];
    if (existingPersona) {
        if (inputName)           inputName.value           = existingPersona.name               || '';
        if (inputYears)          inputYears.value          = existingPersona.years              || '';
        if (selectGender)        selectGender.value        = existingPersona.gender             || '';
        if (selectNationality)   selectNationality.value   = existingPersona.nationality        || '';
        if (inputDesc)           inputDesc.value           = existingPersona.description        || '';
        if (selectVulnerability) selectVulnerability.value = existingPersona.vulnerability_type || '';
        if (selectLegal)         selectLegal.value         = existingPersona.legal_situation    || '';
    } else if (!isGroup) {
    // Individual — tanto edición como nuevo
    if (inputName)           inputName.value           = borrador.name               || '';
    if (inputYears)          inputYears.value          = borrador.years              || String(borrador.age || '');
    if (selectGender)        selectGender.value        = borrador.gender             || '';
    if (selectNationality)   selectNationality.value   = borrador.nationality        || '';
    if (inputDesc)           inputDesc.value           = borrador.description        || borrador.needs || '';
    if (selectVulnerability) selectVulnerability.value = borrador.vulnerability_type || '';
    if (selectLegal)         selectLegal.value         = borrador.legal_situation    || '';
}

    form.addEventListener('submit', (e) => {
        e.preventDefault();

        const descWords = inputDesc.value.trim().split(/\s+/).filter(w => w.length > 0);
        if (descWords.length > 250) {
            alert(`Description is too long (${descWords.length} words). Please limit it to 250 words.`);
            return;
    }

        const personaData = {
            name:               inputName.value.trim()  || 'Unknown Name',
            years:              inputYears.value         || 'Unknown',
            gender:             selectGender.value       || 'Unknown',
            nationality:        selectNationality.value  || 'Unknown',
            description:        inputDesc.value.trim()  || 'No description provided',
            vulnerability_type: selectVulnerability.value || '',
            legal_situation:    selectLegal.value        || ''
        };

        const currentBorrador = JSON.parse(localStorage.getItem('reporteBorrador') || '{}');

        if (!isGroup) {
            // Single person: merge directly (legacy path)
            Object.assign(currentBorrador, personaData);
            localStorage.setItem('reporteBorrador', JSON.stringify(currentBorrador));
            window.location.href = 'new-report.html';
            return;
        }

        // Group path: accumulate into personas array
        if (!Array.isArray(currentBorrador.personas)) {
            currentBorrador.personas = [];
        }
        currentBorrador.personas[currentPersonIndex] = personaData;

        const nextIndex = currentPersonIndex + 1;

        if (nextIndex < peopleCount) {
            // More people — loop back to this same page
            currentBorrador.currentPersonIndex = nextIndex;
            localStorage.setItem('reporteBorrador', JSON.stringify(currentBorrador));
            window.location.href = 'manual-report.html';
        } else {
            // All done — move on to media/new-report
            currentBorrador.currentPersonIndex = nextIndex;
            localStorage.setItem('reporteBorrador', JSON.stringify(currentBorrador));
            window.location.href = 'new-report.html';
        }
    });
});