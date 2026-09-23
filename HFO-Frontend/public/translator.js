// translator.js
const script = document.createElement('script');
script.src = "//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
document.body.appendChild(script);

window.googleTranslateElementInit = function() {
    let gtDiv = document.getElementById('google_translate_element');
    if (!gtDiv) {
        gtDiv = document.createElement('div');
        gtDiv.id = 'google_translate_element';
        gtDiv.style.display = 'none';
        document.body.appendChild(gtDiv);
    }

    new google.translate.TranslateElement({
        pageLanguage: 'en', // Idioma base de tus HTML
        includedLanguages: 'en,es,it', 
        autoDisplay: false
    }, 'google_translate_element');
};