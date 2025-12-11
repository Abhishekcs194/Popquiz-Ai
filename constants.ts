import { Question } from './types';

export const DEFAULT_QUESTIONS: Question[] = [
  {
    id: '1',
    type: 'image',
    content: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/Amazon_logo.svg/2560px-Amazon_logo.svg.png',
    answer: 'Amazon',
    category: 'Logos'
  },
  {
    id: '2',
    type: 'image',
    content: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e7/Instagram_logo_2016.svg/2048px-Instagram_logo_2016.svg.png',
    answer: 'Instagram',
    category: 'Logos'
  },
  {
    id: '3',
    type: 'text',
    content: '⚡🧙‍♂️👓🏫',
    answer: 'Harry Potter',
    category: 'Movies'
  },
  {
    id: '4',
    type: 'image',
    content: 'https://upload.wikimedia.org/wikipedia/en/thumb/a/a6/Mario_Series_Logo.svg/1200px-Mario_Series_Logo.svg.png',
    answer: 'Mario',
    category: 'Games'
  },
  {
    id: '5',
    type: 'image',
    content: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fa/Apple_logo_black.svg/1667px-Apple_logo_black.svg.png',
    answer: 'Apple',
    category: 'Logos'
  },
  {
    id: '6',
    type: 'text',
    content: '🚢🧊💔🎻',
    answer: 'Titanic',
    category: 'Movies'
  },
  {
    id: '7',
    type: 'text',
    content: 'Which planet is known as the Red Planet?',
    answer: 'Mars',
    category: 'Space'
  },
  {
    id: '8',
    type: 'text',
    content: '🦖🦕公园',
    answer: 'Jurassic Park',
    category: 'Movies'
  }
];

export const AVATARS = [
    '🐼', '🦊', '🐯', '🐸', '🐙', '🦄', '🐲', '👽'
];