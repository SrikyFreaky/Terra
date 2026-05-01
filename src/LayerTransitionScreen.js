export class LayerTransitionScreen {
  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'layer-transition hidden';

    this.titleElement = document.createElement('h1');
    this.messageElement = document.createElement('div');

    this.element.append(this.titleElement, this.messageElement);
    document.body.appendChild(this.element);
  }

  show(message) {
    this.titleElement.textContent = 'Layer Complete';
    this.messageElement.textContent = message;
    this.element.classList.remove('hidden');
  }

  hide() {
    this.element.classList.add('hidden');
  }
}
