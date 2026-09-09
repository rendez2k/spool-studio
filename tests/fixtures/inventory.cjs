const colours = [
  { colour: 'Orange', hex: '#EF8D34' },
  { colour: 'Brown', hex: '#825B42' },
  { colour: 'Black', hex: '#202020' },
  { colour: 'Cream', hex: '#EAD9B2' },
];

module.exports = ['matte', 'standard'].flatMap(finish => colours.map((colour, index) => ({
  id: 'sample-' + finish + '-' + index,
  brand: 'Example Filament',
  product: finish === 'matte' ? 'PLA Matte' : 'PLA Basic',
  material: 'PLA',
  finish,
  ...colour,
  date: '2026-01-01',
  spools: 2,
  quantity: 2,
  weightGrams: 1000,
  packaging: 'spooled',
  used: false,
})));
