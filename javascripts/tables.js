// docs/javascripts/tables.js
// Aprimoramento de Tabelas Responsivas para Dispositivos Móveis no MkDocs Material

(function () {
  function enhanceResponsiveTables() {
    var tables = document.querySelectorAll('.md-typeset table:not([class]):not(.enhanced-table)');

    tables.forEach(function (table) {
      if (table.classList.contains('enhanced-table')) return;
      table.classList.add('enhanced-table');

      // Se já estiver dentro de container de scroll, não re-encapsular
      if (table.parentElement && table.parentElement.classList.contains('table-scroll-container')) {
        return;
      }

      var wrapper = document.createElement('div');
      wrapper.className = 'table-responsive-wrapper';

      var hint = document.createElement('div');
      hint.className = 'table-scroll-hint';
      hint.innerHTML = '<span class="table-hint-icon">⇄</span> Deslize para os lados para visualizar todas as colunas';

      var scrollContainer = document.createElement('div');
      scrollContainer.className = 'table-scroll-container';

      table.parentNode.insertBefore(wrapper, table);
      wrapper.appendChild(hint);
      scrollContainer.appendChild(table);
      wrapper.appendChild(scrollContainer);

      function checkOverflow() {
        var isOverflowing = scrollContainer.scrollWidth > scrollContainer.clientWidth + 8;
        if (!isOverflowing) {
          hint.classList.add('is-hidden');
          wrapper.classList.remove('has-overflow-right');
          wrapper.classList.remove('has-overflow-left');
        } else {
          hint.classList.remove('is-hidden');
          var maxScroll = scrollContainer.scrollWidth - scrollContainer.clientWidth;
          var currentScroll = scrollContainer.scrollLeft;

          if (currentScroll > 15) {
            hint.classList.add('is-scrolled');
            wrapper.classList.add('has-overflow-left');
          } else {
            hint.classList.remove('is-scrolled');
            wrapper.classList.remove('has-overflow-left');
          }

          if (currentScroll < maxScroll - 15) {
            wrapper.classList.add('has-overflow-right');
          } else {
            wrapper.classList.remove('has-overflow-right');
          }
        }
      }

      scrollContainer.addEventListener('scroll', checkOverflow, { passive: true });
      window.addEventListener('resize', checkOverflow, { passive: true });

      requestAnimationFrame(checkOverflow);
      setTimeout(checkOverflow, 150);
      setTimeout(checkOverflow, 500);
    });
  }

  // Execução imediata na carga do script
  enhanceResponsiveTables();

  // Execução no evento DOMContentLoaded (se ainda pendente)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enhanceResponsiveTables);
  }

  // Execução no evento window load completo
  window.addEventListener('load', enhanceResponsiveTables);

  // Integração reativa com o Material for MkDocs (Instant Loading)
  if (typeof document$ !== 'undefined' && document$.subscribe) {
    document$.subscribe(enhanceResponsiveTables);
  }
})();
