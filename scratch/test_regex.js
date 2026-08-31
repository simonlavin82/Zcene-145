let html = `<script type="module" crossorigin src="/assets/index-DNFo8pj6.js"></script>
  <link rel="stylesheet" crossorigin href="/assets/index-BcdVEU_n.css">`;

html = html.split('src="assets/').join('src="/assets/');
html = html.split('src="index').join('src="/assets/index');
html = html.split('href="assets/').join('href="/assets/');
html = html.split('href="index').join('href="/assets/index');

html = html.replace(/src=["'](?:.\/)?(index-[^"']+\.js)["']/g, 'src="/assets/$1"');
html = html.replace(/href=["'](?:.\/)?(index-[^"']+\.css)["']/g, 'href="/assets/$1"');

console.log(html);
