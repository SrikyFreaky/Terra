export class GameOverScreen {
  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'game-over-screen hidden';
    this.element.innerHTML = `
      <div class="content">
        <h1>MISSION FAILED</h1>
        <p>The ecosystem has collapsed.</p>
        <div class="stats">
            <div id="go-time">Time Active: 00:00</div>
        </div>
        <button id="retry-btn">RETRY MISSION</button>
      </div>
    `;
    document.body.appendChild(this.element);

    this.retryBtn = this.element.querySelector('#retry-btn');
    this.retryBtn.onclick = () => window.location.reload();
  }

  show(elapsedSeconds) {
    const min = String(Math.floor(elapsedSeconds / 60)).padStart(2, '0');
    const sec = String(Math.floor(elapsedSeconds % 60)).padStart(2, '0');
    this.element.querySelector('#go-time').textContent = `Time Active: ${min}:${sec}`;
    this.element.classList.remove('hidden');
  }

  hide() {
    this.element.classList.add('hidden');
  }
}
