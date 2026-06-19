document.addEventListener('DOMContentLoaded', () => {
  // 1. Active page highlighting
  const currentPath = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-link').forEach(link => {
    if (link.getAttribute('href') === currentPath) {
      link.classList.add('active');
    }
  });

  // 2. Hamburger menu toggle
  const hamburger = document.querySelector('.hamburger');
  const sidebar = document.querySelector('.sidebar');
  if (hamburger && sidebar) {
    hamburger.addEventListener('click', (e) => {
      sidebar.classList.toggle('open');
      e.stopPropagation();
    });

    document.addEventListener('click', (e) => {
      if (!sidebar.contains(e.target) && sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
      }
    });
  }

  // 3. Copy code button
  document.querySelectorAll('pre code').forEach(codeBlock => {
    const pre = codeBlock.parentNode;
    const button = document.createElement('button');
    button.className = 'copy-btn';
    button.textContent = 'Copy';
    
    button.addEventListener('click', () => {
      const code = codeBlock.textContent;
      navigator.clipboard.writeText(code).then(() => {
        button.textContent = 'Copied!';
        setTimeout(() => {
          button.textContent = 'Copy';
        }, 2000);
      });
    });

    pre.appendChild(button);
  });

  // 4. Smooth scroll
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        target.scrollIntoView({
          behavior: 'smooth'
        });
      }
    });
  });

  // 5. On-this-page navigation
  const tocList = document.getElementById('page-toc');
  if (tocList) {
    const headings = document.querySelectorAll('.content-inner h2, .content-inner h3');
    headings.forEach(heading => {
      const id = heading.id || heading.textContent.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
      heading.id = id;
      
      const li = document.createElement('li');
      li.style.paddingLeft = heading.tagName === 'H3' ? '1rem' : '0';
      const a = document.createElement('a');
      a.href = `#${id}`;
      a.textContent = heading.textContent;
      li.appendChild(a);
      tocList.appendChild(li);
    });

    // Scroll-spy
    window.addEventListener('scroll', () => {
      let current = '';
      headings.forEach(heading => {
        const sectionTop = heading.offsetTop;
        if (pageYOffset >= sectionTop - 100) {
          current = heading.id;
        }
      });

      document.querySelectorAll('.on-this-page a').forEach(a => {
        a.style.color = '';
        if (a.getAttribute('href') === `#${current}`) {
          a.style.color = 'var(--accent-color)';
        }
      });
    });
  }

  // 6. Client-side search
  const searchInput = document.querySelector('.search-input');
  if (searchInput) {
    const pages = [
      { title: 'Home', url: 'index.html' },
      { title: 'Getting Started', url: 'getting-started.html' },
      { title: 'Tools Reference', url: 'tools.html' },
      { title: 'CLI Reference', url: 'cli-reference.html' },
      { title: 'Agent Profiles', url: 'profiles.html' },
      { title: 'Task Templates', url: 'templates.html' },
      { title: 'Custom Plugins', url: 'plugins.html' },
      { title: 'Configuration', url: 'configuration.html' },
      { title: 'Examples', url: 'examples.html' }
    ];

    const resultsDiv = document.createElement('div');
    resultsDiv.style.cssText = 'position:absolute; top:100%; right:0; background:var(--surface-color); border:1px solid var(--border-color); border-radius:6px; width:250px; display:none; max-height:300px; overflow-y:auto; z-index:1000;';
    searchInput.parentNode.style.position = 'relative';
    searchInput.parentNode.appendChild(resultsDiv);

    searchInput.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      resultsDiv.innerHTML = '';
      if (!q) {
        resultsDiv.style.display = 'none';
        return;
      }

      const matches = pages.filter(p => p.title.toLowerCase().includes(q));
      if (matches.length > 0) {
        matches.forEach(m => {
          const div = document.createElement('a');
          div.href = m.url;
          div.textContent = m.title;
          div.style.cssText = 'display:block; padding:0.5rem 1rem; color:var(--text-primary); text-decoration:none; border-bottom:1px solid var(--border-color);';
          div.addEventListener('mouseenter', () => div.style.background = 'rgba(255,255,255,0.05)');
          div.addEventListener('mouseleave', () => div.style.background = '');
          resultsDiv.appendChild(div);
        });
        resultsDiv.style.display = 'block';
      } else {
        resultsDiv.style.display = 'none';
      }
    });

    document.addEventListener('click', () => resultsDiv.style.display = 'none');
  }
  
  // 7. Mobile menu close on nav click
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
      if (window.innerWidth <= 768) {
        sidebar.classList.remove('open');
      }
    });
  });
});
