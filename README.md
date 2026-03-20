<h1 align="center">Neo Search Launcher</h1>

<p align="center">
  <b>A lightweight Tauri-powered search launcher integrated into Seelen.</b>
</p>

<p align="center">
  Launch apps, trigger system actions, and perform quick web searches from a minimal, keyboard-driven interface.
</p>

<p align="center">
  <img alt="Platform" src="https://img.shields.io/badge/platform-Windows-0078D6?style=for-the-badge" />
  <img alt="Framework" src="https://img.shields.io/badge/Tauri-v2-24C8DB?style=for-the-badge" />
  <img alt="Frontend" src="https://img.shields.io/badge/frontend-Vanilla_JS-F7DF1E?style=for-the-badge&logo=javascript&logoColor=000" />
  <img alt="Backend" src="https://img.shields.io/badge/backend-Rust-000000?style=for-the-badge&logo=rust" />
  <img alt="Status" src="https://img.shields.io/badge/status-Active-6CC644?style=for-the-badge" />
</p>

---

<h2>✨ Features</h2>

<ul>
  <li>⚡ Instant app search from the Windows Start Menu and system apps</li>
  <li>🌐 Quick web search commands:
    <ul>
      <li><code>g query</code> → Google</li>
      <li><code>yt query</code> → YouTube</li>
      <li><code>gh query</code> → GitHub</li>
    </ul>
  </li>
  <li>⌨️ Global shortcut support</li>
  <li>🧠 Usage-based ranking</li>
  <li>🪟 Native Windows integration through Tauri</li>
  <li>🧩 Seelen widget launcher integration</li>
</ul>

---

<h2>🧱 Tech Stack</h2>

<ul>
  <li><b>Frontend:</b> HTML, CSS, Vanilla JavaScript</li>
  <li><b>Backend:</b> Rust with Tauri v2</li>
  <li><b>Integration:</b> Seelen widget system</li>
  <li><b>Platform:</b> Windows</li>
</ul>

---

<h2>📦 Installation</h2>

<h3>1. Clone the repository</h3>

<pre><code>git clone https://github.com/jimmykartel69-design/neo-search-launcher-seelen.git
cd neo-search-launcher-seelen
</code></pre>

<h3>2. Install dependencies</h3>

<pre><code>npm install
</code></pre>

<h3>3. Run in development</h3>

<pre><code>npm run tauri dev
</code></pre>

---

<h2>🏗️ Build</h2>

<pre><code>npm run tauri build
</code></pre>

<p>Generated files:</p>

<ul>
  <li><b>Executable:</b><br />
    <code>src-tauri/target/release/neo-search-v3.exe</code>
  </li>
  <li><b>NSIS installer:</b><br />
    <code>src-tauri/target/release/bundle/nsis/NeoSearch_3.0.0_x64-setup.exe</code>
  </li>
  <li><b>MSI installer:</b><br />
    <code>src-tauri/target/release/bundle/msi/NeoSearch_3.0.0_x64_en-US.msi</code>
  </li>
</ul>

---

<h2>🧩 Seelen Integration</h2>

<p>
This project includes a custom Seelen widget that launches NeoSearch directly from the toolbar.
</p>

<h3>How it works</h3>

<p>The widget calls the installed executable through the Seelen runtime API:</p>

<pre><code>await api.run({
  program: "C:\\Program Files\\NeoSearch\\NeoSearch.exe"
});
</code></pre>

<h3>Integration steps</h3>

<ol>
  <li>Build or install NeoSearch</li>
  <li>Update the executable path in the Seelen widget YAML if needed</li>
  <li>Import the widget into Seelen</li>
  <li>Click the widget button to launch NeoSearch</li>
</ol>

---

<h2>⌨️ Usage</h2>

<p>Use the launcher to quickly search and open applications or run web queries.</p>

<table>
  <thead>
    <tr>
      <th>Command</th>
      <th>Action</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><code>g something</code></td>
      <td>Search on Google</td>
    </tr>
    <tr>
      <td><code>yt something</code></td>
      <td>Search on YouTube</td>
    </tr>
    <tr>
      <td><code>gh something</code></td>
      <td>Search on GitHub</td>
    </tr>
    <tr>
      <td><code>Ctrl + Space</code></td>
      <td>Open the launcher (if the shortcut is available)</td>
    </tr>
  </tbody>
</table>

---

<h2>🧠 Architecture</h2>

<pre><code>src/
├── index.html
├── app.js
└── style.css

src-tauri/
├── src/lib.rs
└── tauri.conf.json

neo-search-launcher.yaml
</code></pre>

<p>
<b>Note:</b> An old <code>main.js</code> Electron file may still exist in the repository as legacy code,
but the active application runtime is based on <b>Tauri</b>.
</p>

---

<h2>⚠️ Known Issues</h2>

<h3>1. Global shortcut conflict</h3>

<p>If the application crashes at startup with an error like:</p>

<pre><code>HotKey already registered: Ctrl+Space
</code></pre>

<p>It means another process is already using the shortcut.</p>

<p><b>Fix:</b></p>
<ul>
  <li>Change the shortcut in the Rust backend</li>
  <li>Or close the application already using <code>Ctrl + Space</code></li>
</ul>

<h3>2. App opens then closes immediately</h3>

<p>Possible causes:</p>
<ul>
  <li>global shortcut conflict</li>
  <li>startup panic in the setup hook</li>
  <li>invalid runtime state</li>
</ul>

<h3>3. Search UI opens but results do not load</h3>

<p>Check the following:</p>
<ul>
  <li>Tauri frontend API availability</li>
  <li><code>get_catalog</code> backend response</li>
  <li>DevTools console for JavaScript errors</li>
</ul>

---

<h2>🧪 Debugging</h2>

<h3>Run in development mode</h3>

<pre><code>npm run tauri dev
</code></pre>

<h3>Enable Rust backtrace</h3>

<pre><code>$env:RUST_BACKTRACE=1
npm run tauri dev
</code></pre>

<h3>Open DevTools</h3>

<p>When the app is running, press:</p>

<pre><code>Ctrl + Shift + I
</code></pre>

---

<h2>🔒 Important Notes</h2>

<p>Do <b>not</b> commit build artifacts to Git.</p>

<p>Add the following to your <code>.gitignore</code>:</p>

<pre><code># Rust / Tauri
target/
src-tauri/target/

# Debug symbols
*.pdb

# Rust build artifacts
*.rlib
*.rmeta
</code></pre>

---

<h2>🗺️ Roadmap</h2>

<ul>
  <li>[ ] Configurable keyboard shortcuts</li>
  <li>[ ] Better search ranking</li>
  <li>[ ] More system commands</li>
  <li>[ ] Better UI polish</li>
  <li>[ ] Cleaner architecture after full Electron removal</li>
</ul>

---

<h2>👤 Author</h2>

<p><b>Jimmy</b></p>

---

<h2>📄 License</h2>

<p>MIT License</p>

---

<p align="center">
  <b>Neo Search Launcher</b><br />
  Fast. Native. Minimal.
</p>
