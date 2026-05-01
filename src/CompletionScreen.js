export class CompletionScreen {
  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'completion-screen hidden';

    this.titleElement = document.createElement('h1');
    this.timeElement = document.createElement('div');
    this.cleanedElement = document.createElement('div');
    this.button = document.createElement('button');

    this.titleElement.textContent = 'World Restored';
    this.cleanedElement.textContent = 'Cleaned: 100%';
    this.button.textContent = 'Play Again';
    this.button.addEventListener('click', () => window.location.reload());

    this.element.append(this.titleElement, this.timeElement, this.cleanedElement, this.button);
    document.body.appendChild(this.element);
  }

  show(elapsedSeconds, title = 'World Restored') {
    this.titleElement.textContent = title;
    this.timeElement.textContent = `Time taken: ${this.#formatTime(elapsedSeconds)}`;
    this.element.classList.remove('hidden');
  }

  #formatTime(elapsedSeconds) {
    const minutes = Math.floor(elapsedSeconds / 60);
    const seconds = Math.floor(elapsedSeconds % 60);

    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
}
