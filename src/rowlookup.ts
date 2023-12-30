const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

const COLS = {
    HONORIFIC: ALPHABET.indexOf('A'),
    FIRST_NAME: ALPHABET.indexOf('B'),
    LAST_NAME: ALPHABET.indexOf('C'),

    COMMENTS: ALPHABET.indexOf('E'),

    FULL_DAY: ALPHABET.indexOf('G'),

    PERIOD: {
        P1: ALPHABET.indexOf('J'),
        IGS: ALPHABET.indexOf('K'),
        P2: ALPHABET.indexOf('L'),
        P3: ALPHABET.indexOf('M'),
        P4: ALPHABET.indexOf('N'),
        P5: ALPHABET.indexOf('O'),
        P6: ALPHABET.indexOf('P'),
        P7: ALPHABET.indexOf('Q'),
        P8: ALPHABET.indexOf('R'),
        P9: ALPHABET.indexOf('S'),
    }

};


export const SKIP_ROWS = 2;

export default COLS;
