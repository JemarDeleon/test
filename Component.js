<style id="page-load-blocker">
  body {
    opacity: 0;
    transition: opacity 0.4s ease;
  }
</style>

<script>
  (function () {
    var SAFETY_TIMEOUT = 4000;

    var revealed = false;

    function revealPage() {
      if (revealed) return;
      revealed = true;
      document.body.style.opacity = "1";
    }

    window.addEventListener("load", revealPage);

    setTimeout(revealPage, SAFETY_TIMEOUT);
  })();
</script>