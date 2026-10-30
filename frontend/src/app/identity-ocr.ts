export interface IdentityTextFields {
  firstName: string;
  lastName: string;
  idNumber: string;
  dateOfBirth: string;
  gender: string;
}

const labels = /^(?:surname|last name|first names?|forenames?|names?|sex|gender|date of birth|birth date|dob|identity number|id number|nationality|country(?: of birth)?|date of issue)\b/i;

export function parseIdentityText(text: string): IdentityTextFields {
  const lines = text.split(/\r?\n/).map(line => line.trim().replace(/^[|:;.]+\s*/, '').replace(/\s+/g, ' ')).filter(Boolean);
  function field(label: RegExp): string {
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(label);
      if (!match) continue;
      const value = (match[1] || '').replace(/^[:;.\s|]+/, '').trim() || lines[i + 1] || '';
      if (!labels.test(value)) return value;
    }
    return '';
  }
  const name = (value: string) => /^[\p{L}][\p{L} '\-]*$/u.test(value) ? value : '';
  const id = field(/^(?:identity number|id number)\s*[:.]?\s*(.*)$/i).replace(/[ \t-]/g, '');
  const birth = field(/^(?:date of birth|birth date|dob)\s*[:.]?\s*(.*)$/i);
  const gender = field(/^(?:sex|gender)\s*[:.]?\s*(.*)$/i);
  const idNumber = /^\d{13}$/.test(id) ? id : text.match(/\b\d{13}\b/)?.[0] || '';
  // Only derive a missing date from a checksum-valid SA identity number.
  let derivedBirth = '';
  if (/^\d{10}[01]8\d$/.test(idNumber)) {
    const sum = [...idNumber].reduce((total, digit, index) => {
      const n = Number(digit) * (index % 2 ? 2 : 1);
      return total + (n > 9 ? n - 9 : n);
    }, 0);
    if (sum % 10 === 0) {
      const yy = Number(idNumber.slice(0, 2));
      const year = yy > new Date().getFullYear() % 100 ? 1900 + yy : 2000 + yy;
      derivedBirth = parseBirthDate(`${year}-${idNumber.slice(2,4)}-${idNumber.slice(4,6)}`);
      if (derivedBirth > new Date().toISOString().slice(0,10)) derivedBirth = '';
    }
  }
  return {
    firstName: name(field(/^(?:first names?|forenames?|names?)\s*[:.]?\s*(.*)$/i)),
    lastName: name(field(/^(?:surname|last name)\s*[:.]?\s*(.*)$/i)),
    idNumber,
    dateOfBirth: birth ? parseBirthDate(birth) : derivedBirth,
    gender: /^(?:m|male)$/i.test(gender) ? 'male' : /^(?:f|female)$/i.test(gender) ? 'female' : ''
  };
}

function parseBirthDate(value: string): string {
  const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  let year: number, month: number, day: number;
  const iso = value.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  const numeric = value.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  const named = value.match(/^(\d{1,2})[ -]([A-Za-z]{3,9})[ -](\d{4})$/);
  if (iso) [,year,month,day] = iso.map(Number);
  else if (numeric) [,day,month,year] = numeric.map(Number);
  else if (named) { day = Number(named[1]); month = months.indexOf(named[2].slice(0,3).toLowerCase()) + 1; year = Number(named[3]); }
  else return '';
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 1900 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return '';
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}
