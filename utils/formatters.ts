export const formatSystemTimestamp = (timestampMs: any): string => {
  if (!timestampMs) return '';
  let date: Date;
  if (typeof timestampMs.toDate === 'function') {
    date = timestampMs.toDate();
  } else if (timestampMs instanceof Date) {
    date = timestampMs;
  } else if (timestampMs.seconds) {
    date = new Date(timestampMs.seconds * 1000);
  } else if (typeof timestampMs === 'number' || typeof timestampMs === 'string') {
    date = new Date(timestampMs);
  } else {
    return '';
  }

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const dateStr = `${day}/${month}/${year}`;

  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'pm' : 'am';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const timeStr = `${hours}:${minutes} ${ampm}`;

  return `${dateStr} • ${timeStr}`;
};
