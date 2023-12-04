import './editor.css';
import '../src/collab/client/collab';
import './main.html';

import EditorConnection from '../src/collab/client/collab';

const CARD_ID = 'xAzPkcMqtj2QiJRfS';
new EditorConnection(CARD_ID);
