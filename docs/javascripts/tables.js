// docs/javascripts/tables.js
// Aprimoramento de Tabelas Responsivas para Dispositivos Móveis e Desktop no MkDocs Material

(function () {
  'use strict';

  function enhanceResponsiveTables() {
    var tables = document.querySelectorAll('.md-typeset table');

    tables.forEach(function (table) {
      // Ignorar tabelas especiais (mermaid, equações mathjax ou tabelas já encapsuladas)
      if (
        table.classList.contains('enhanced-table') ||
        table.closest('.table-scroll-container, .mermaid, .arithmatex, .MathJax')
      ) {
        return;
      }

      table.classList.add('enhanced-table');

      var wrapper = document.createElement('div');
      wrapper.className = 'table-responsive-wrapper';

      var hint = document.createElement('div');
      hint.className = 'table-scroll-hint';
      hint.innerHTML =
        '<span class="table-hint-icon">⇄</span> Deslize para os lados para ver colunas ou na vertical para rolar a página';

      var scrollContainer = document.createElement('div');
      scrollContainer.className = 'table-scroll-container';
      scrollContainer.setAttribute('tabindex', '0');
      scrollContainer.setAttribute('role', 'region');
      scrollContainer.setAttribute('aria-label', 'Tabela com rolagem horizontal');

      table.parentNode.insertBefore(wrapper, table);
      wrapper.appendChild(hint);
      scrollContainer.appendChild(table);
      wrapper.appendChild(scrollContainer);

      // Suporte a arrasto ergonômico por mouse/ponteiro no desktop (grab-to-scroll)
      var isPointerDown = false;
      var startX = 0;
      var startY = 0;
      var scrollStartLeft = 0;
      var hasDragged = false;
      var activePointerId = null;

      function onPointerMove(e) {
        if (!isPointerDown || e.pointerId !== activePointerId) return;

        var deltaX = e.clientX - startX;
        var deltaY = e.clientY - startY;

        // Se ainda não iniciou o arrasto, verificar se o movimento horizontal é predominante
        if (!hasDragged) {
          if (Math.abs(deltaX) > 4 && Math.abs(deltaX) > Math.abs(deltaY)) {
            hasDragged = true;
            scrollContainer.classList.add('is-dragging');
            try {
              scrollContainer.setPointerCapture(e.pointerId);
            } catch (_) {}
          }
        }

        // Durante o arrasto ativo
        if (hasDragged) {
          scrollContainer.scrollLeft = scrollStartLeft - deltaX;
          if (e.cancelable) {
            e.preventDefault();
          }
        }
      }

      function onPointerUp(e) {
        if (!isPointerDown || (e && e.pointerId !== activePointerId)) return;

        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerUp);

        if (hasDragged) {
          // Suprimir evento de clique acidental em links que foram arrastados
          var suppressClick = function (ev) {
            ev.preventDefault();
            ev.stopPropagation();
            ev.stopImmediatePropagation();
            window.removeEventListener('click', suppressClick, true);
          };
          window.addEventListener('click', suppressClick, true);
          setTimeout(function () {
            window.removeEventListener('click', suppressClick, true);
          }, 120);

          try {
            scrollContainer.releasePointerCapture(activePointerId);
          } catch (_) {}
        }

        isPointerDown = false;
        hasDragged = false;
        activePointerId = null;
        scrollContainer.classList.remove('is-dragging');
      }

      scrollContainer.addEventListener('pointerdown', function (e) {
        // Telas sensíveis ao toque utilizam o motor nativo e fluido do navegador (touch-action: pan-x pan-y)
        if (e.pointerType === 'touch') return;
        // Apenas botão principal (esquerdo)
        if (e.button !== 0) return;

        isPointerDown = true;
        activePointerId = e.pointerId;
        startX = e.clientX;
        startY = e.clientY;
        scrollStartLeft = scrollContainer.scrollLeft;
        hasDragged = false;

        window.addEventListener('pointermove', onPointerMove, { passive: false });
        window.addEventListener('pointerup', onPointerUp);
        window.addEventListener('pointercancel', onPointerUp);
      });

      // Prevenir arrasto de texto/imagens HTML5 que bloqueie a rolagem
      scrollContainer.addEventListener('dragstart', function (e) {
        if (isPointerDown || hasDragged) {
          e.preventDefault();
        }
      });

      function checkOverflow() {
        var isOverflowing = scrollContainer.scrollWidth > scrollContainer.clientWidth + 4;
        if (!isOverflowing) {
          hint.classList.add('is-hidden');
          wrapper.classList.remove('has-overflow-right');
          wrapper.classList.remove('has-overflow-left');
          scrollContainer.style.cursor = 'default';
        } else {
          hint.classList.remove('is-hidden');
          scrollContainer.style.cursor = 'grab';
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
      setTimeout(checkOverflow, 100);
      setTimeout(checkOverflow, 400);
    });
  }

  // Execução imediata
  enhanceResponsiveTables();

  // Execução no DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enhanceResponsiveTables);
  }

  // Execução no load completo
  window.addEventListener('load', enhanceResponsiveTables);

  // Integração com navegação instantânea do Material for MkDocs (document$)
  if (typeof document$ !== 'undefined' && document$.subscribe) {
    document$.subscribe(enhanceResponsiveTables);
  }

  // Observador de mutações para suportar renderizações assíncronas
  var observer = new MutationObserver(function (mutations) {
    var shouldCheck = false;
    for (var i = 0; i < mutations.length; i++) {
      if (mutations[i].addedNodes && mutations[i].addedNodes.length > 0) {
        shouldCheck = true;
        break;
      }
    }
    if (shouldCheck) {
      enhanceResponsiveTables();
    }
  });

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener('DOMContentLoaded', function () {
      if (document.body) {
        observer.observe(document.body, { childList: true, subtree: true });
      }
    });
  }
})();
