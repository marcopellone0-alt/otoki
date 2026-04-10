(function(){
  try {
    var d = document.createElement('div');
    d.id = '__diag';
    d.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;padding:8px 12px;font:12px/1.4 monospace;background:#065f46;color:#6ee7b7;white-space:pre-wrap;max-height:40vh;overflow:auto;';
    d.textContent = 'JS OK - ' + navigator.userAgent.slice(0, 80);
    document.documentElement.appendChild(d);

    window.__diagLog = function(msg) {
      var el = document.getElementById('__diag');
      if (el) el.textContent += '\n' + msg;
    };

    window.addEventListener('error', function(e) {
      var el = document.getElementById('__diag');
      if (el) {
        el.style.background = '#7f1d1d';
        el.style.color = '#fca5a5';
        el.textContent += '\nERROR: ' + e.message + ' @ ' + (e.filename||'?') + ':' + e.lineno;
      }
    });

    window.addEventListener('unhandledrejection', function(e) {
      var el = document.getElementById('__diag');
      if (el) {
        el.style.background = '#7f1d1d';
        el.style.color = '#fca5a5';
        el.textContent += '\nPROMISE: ' + (e.reason && e.reason.message ? e.reason.message : String(e.reason));
      }
    });
  } catch(err) {
    document.title = 'DIAG FAIL: ' + err.message;
  }
})();
