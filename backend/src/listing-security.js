const common = ['title', 'description', 'category', 'area', 'status'];
const fields = {
  marketplace: new Set([...common, 'productType', 'condition', 'price', 'images']),
  job: new Set([...common, 'jobType', 'employmentType', 'workMode', 'paymentAmount', 'paymentFrequency', 'requiredSkills', 'experienceRequired', 'startDate', 'closingDate', 'numberOfPositions'])
};
const statuses = {
  marketplace: ['AVAILABLE', 'RESERVED', 'SOLD', 'CANCELLED'],
  job: ['OPEN', 'IN_PROGRESS', 'FILLED', 'COMPLETED', 'CANCELLED']
};

export function listingChanges(kind, input) {
  const invalid = () => { throw Object.assign(new Error('Invalid listing changes.'), { status: 400 }); };
  if (!input || typeof input !== 'object' || Array.isArray(input) || !Object.keys(input).length) invalid();
  const output = {};
  for (const [field, value] of Object.entries(input)) {
    if (!fields[kind]?.has(field)) invalid();
    if (['price', 'paymentAmount', 'numberOfPositions'].includes(field)) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1e9) invalid();
      if (field === 'numberOfPositions' && (!Number.isInteger(value) || value < 1)) invalid();
    } else if (['images', 'requiredSkills'].includes(field)) {
      if (!Array.isArray(value) || value.length > 20 || value.some(v => typeof v !== 'string' || v.length > 2048)) invalid();
      if (field === 'images' && value.some(v => !/^https:\/\//i.test(v) && !/^\/uploads\/[a-z0-9/_-]+\.(png|jpe?g|webp)$/i.test(v))) invalid();
    } else if (typeof value !== 'string' || value.length > (field === 'description' ? 10000 : 500)) invalid();
    if (field === 'status' && !statuses[kind].includes(value)) invalid();
    if (field === 'title' && !value.trim()) invalid();
    output[field] = value;
  }
  return output;
}

export function ownedListing(rows, id, ownerField, userId) {
  return rows.find(row => String(row.id) === String(id) && String(row[ownerField]) === String(userId));
}

export function listingCreation(kind, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || !fields[kind]) throw Object.assign(new Error('Invalid listing.'), {status:400});
  // Older clients submit owner metadata with the form. Never persist those untrusted fields.
  const editable = Object.fromEntries(Object.entries(input).filter(([key]) => fields[kind].has(key) && key !== 'status'));
  const result = listingChanges(kind,editable);
  if (!result.title || (kind === 'marketplace' && result.price === undefined)) throw Object.assign(new Error('Listing title and price are required.'), {status:400});
  result.title = result.title.trim();
  return result;
}
