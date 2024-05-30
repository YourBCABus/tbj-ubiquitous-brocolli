const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

const COLS = {
    HONORIFIC: ALPHABET.indexOf('A'),
    FIRST_NAME: ALPHABET.indexOf('B'),
    LAST_NAME: ALPHABET.indexOf('C'),

    REPORT_TO: ALPHABET.indexOf('E'),

    FULL_DAY: ALPHABET.indexOf('G'),

    PARTIAL: {
        AM: ALPHABET.indexOf('I'),
        PM: ALPHABET.indexOf('J'),
    },

    PERIOD: {
        P1: ALPHABET.indexOf('M'),
        IGS: ALPHABET.indexOf('N'),
        P2: ALPHABET.indexOf('O'),
        P3: ALPHABET.indexOf('P'),
        P4: ALPHABET.indexOf('Q'),
        P5: ALPHABET.indexOf('R'),
        P6: ALPHABET.indexOf('S'),
        P7: ALPHABET.indexOf('T'),
        P8: ALPHABET.indexOf('U'),
        P9: ALPHABET.indexOf('V'),
    },

    COMMENTS: ALPHABET.indexOf('X'),
};


export const SKIP_ROWS = 2;

export default COLS;
