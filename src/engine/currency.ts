// Currency metadata plus offline fallback rates (units per 1 USD).
// Live rates replace these at runtime via setRates().

export interface CurrencyMeta {
  code: string;
  /** Symbol shown in output. Prefix symbols render as "$5", others as "5 CHF". */
  symbol?: string;
  prefix?: boolean;
  /** Extra exact-case aliases (symbols, codes). */
  aliases?: string[];
  /** Case-insensitive names. */
  words?: string[];
  decimals?: number;
  crypto?: boolean;
  name: string;
}

export const CURRENCIES: CurrencyMeta[] = [
  { code: 'USD', name: 'US Dollar', symbol: '$', prefix: true, aliases: ['$', 'US$'], words: ['dollar', 'dollars', 'buck', 'bucks', 'us dollar', 'us dollars'] },
  { code: 'EUR', name: 'Euro', symbol: '€', prefix: true, aliases: ['€'], words: ['euro', 'euros'] },
  { code: 'GBP', name: 'British Pound', symbol: '£', prefix: true, aliases: ['£'], words: ['quid', 'pound sterling', 'pounds sterling', 'british pound', 'british pounds', 'sterling'] },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥', prefix: true, aliases: ['¥', '￥', 'JP¥'], words: ['yen'], decimals: 0 },
  { code: 'CNY', name: 'Chinese Yuan', symbol: 'CN¥', prefix: true, aliases: ['CN¥', 'RMB'], words: ['yuan', 'renminbi'] },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹', prefix: true, aliases: ['₹'], words: ['rupee', 'rupees', 'indian rupee', 'indian rupees'] },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'CA$', prefix: true, aliases: ['C$', 'CA$'], words: ['canadian dollar', 'canadian dollars', 'loonie', 'loonies'] },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', prefix: true, aliases: ['A$', 'AU$'], words: ['australian dollar', 'australian dollars'] },
  { code: 'NZD', name: 'New Zealand Dollar', symbol: 'NZ$', prefix: true, aliases: ['NZ$'], words: ['new zealand dollar', 'new zealand dollars'] },
  { code: 'HKD', name: 'Hong Kong Dollar', symbol: 'HK$', prefix: true, aliases: ['HK$'], words: ['hong kong dollar', 'hong kong dollars'] },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', prefix: true, aliases: ['S$'], words: ['singapore dollar', 'singapore dollars'] },
  { code: 'MXN', name: 'Mexican Peso', symbol: 'MX$', prefix: true, aliases: ['MX$'], words: ['peso', 'pesos', 'mexican peso', 'mexican pesos'] },
  { code: 'BRL', name: 'Brazilian Real', symbol: 'R$', prefix: true, aliases: ['R$'], words: ['reais', 'brazilian real', 'brazilian reais'] },
  { code: 'CHF', name: 'Swiss Franc', aliases: [], words: ['franc', 'francs', 'swiss franc', 'swiss francs'] },
  { code: 'SEK', name: 'Swedish Krona', aliases: [], words: ['swedish krona', 'swedish kronor'] },
  { code: 'NOK', name: 'Norwegian Krone', aliases: [], words: ['norwegian krone', 'norwegian kroner'] },
  { code: 'DKK', name: 'Danish Krone', aliases: [], words: ['danish krone', 'danish kroner'] },
  { code: 'PLN', name: 'Polish Złoty', symbol: 'zł', aliases: ['zł'], words: ['zloty', 'zlotys', 'złoty'] },
  { code: 'CZK', name: 'Czech Koruna', symbol: 'Kč', aliases: ['Kč'], words: ['koruna', 'czech koruna'] },
  { code: 'HUF', name: 'Hungarian Forint', symbol: 'Ft', aliases: [], words: ['forint', 'forints'], decimals: 0 },
  { code: 'RUB', name: 'Russian Ruble', symbol: '₽', prefix: true, aliases: ['₽'], words: ['ruble', 'rubles', 'rouble', 'roubles'] },
  { code: 'TRY', name: 'Turkish Lira', symbol: '₺', prefix: true, aliases: ['₺'], words: ['lira', 'turkish lira'] },
  { code: 'ILS', name: 'Israeli Shekel', symbol: '₪', prefix: true, aliases: ['₪', 'NIS'], words: ['shekel', 'shekels'] },
  { code: 'KRW', name: 'South Korean Won', symbol: '₩', prefix: true, aliases: ['₩'], words: ['korean won'], decimals: 0 },
  { code: 'TWD', name: 'New Taiwan Dollar', symbol: 'NT$', prefix: true, aliases: ['NT$'], words: ['taiwan dollar', 'taiwan dollars'] },
  { code: 'THB', name: 'Thai Baht', symbol: '฿', prefix: true, aliases: ['฿'], words: ['baht'] },
  { code: 'VND', name: 'Vietnamese Dong', symbol: '₫', prefix: false, aliases: ['₫'], words: ['vietnamese dong'], decimals: 0 },
  { code: 'IDR', name: 'Indonesian Rupiah', symbol: 'Rp', prefix: true, aliases: ['Rp'], words: ['rupiah'], decimals: 0 },
  { code: 'MYR', name: 'Malaysian Ringgit', symbol: 'RM', prefix: true, aliases: ['RM'], words: ['ringgit'] },
  { code: 'PHP', name: 'Philippine Peso', symbol: '₱', prefix: true, aliases: ['₱'], words: ['philippine peso', 'philippine pesos'] },
  { code: 'ZAR', name: 'South African Rand', aliases: [], words: ['south african rand'] },
  { code: 'AED', name: 'UAE Dirham', aliases: [], words: ['dirham', 'dirhams'] },
  { code: 'SAR', name: 'Saudi Riyal', aliases: [], words: ['riyal', 'riyals'] },
  { code: 'QAR', name: 'Qatari Riyal', aliases: [] },
  { code: 'KWD', name: 'Kuwaiti Dinar', aliases: [], decimals: 3 },
  { code: 'EGP', name: 'Egyptian Pound', aliases: [] },
  { code: 'NGN', name: 'Nigerian Naira', symbol: '₦', prefix: true, aliases: ['₦'], words: ['naira'] },
  { code: 'KES', name: 'Kenyan Shilling', aliases: [] },
  { code: 'MAD', name: 'Moroccan Dirham', aliases: [] },
  { code: 'PKR', name: 'Pakistani Rupee', aliases: [] },
  { code: 'BDT', name: 'Bangladeshi Taka', symbol: '৳', prefix: true, aliases: ['৳'], words: ['taka'] },
  { code: 'UAH', name: 'Ukrainian Hryvnia', symbol: '₴', prefix: true, aliases: ['₴'], words: ['hryvnia'] },
  { code: 'RON', name: 'Romanian Leu', aliases: [] },
  { code: 'BGN', name: 'Bulgarian Lev', aliases: [] },
  { code: 'ISK', name: 'Icelandic Króna', aliases: [], decimals: 0 },
  { code: 'CLP', name: 'Chilean Peso', aliases: [], decimals: 0 },
  { code: 'COP', name: 'Colombian Peso', aliases: [], decimals: 0 },
  { code: 'ARS', name: 'Argentine Peso', aliases: [] },
  { code: 'PEN', name: 'Peruvian Sol', aliases: [] },
  // Crypto
  { code: 'BTC', name: 'Bitcoin', symbol: '₿', prefix: false, aliases: ['₿', 'XBT'], words: ['bitcoin', 'bitcoins'], crypto: true },
  { code: 'ETH', name: 'Ether', aliases: ['Ξ'], words: ['ether', 'ethereum'], crypto: true },
  { code: 'SOL', name: 'Solana', aliases: [], words: ['solana'], crypto: true },
  { code: 'DOGE', name: 'Dogecoin', aliases: [], words: ['dogecoin', 'dogecoins'], crypto: true },
  { code: 'LTC', name: 'Litecoin', aliases: [], words: ['litecoin', 'litecoins'], crypto: true },
  { code: 'XRP', name: 'XRP', aliases: [], words: ['ripple'], crypto: true },
  { code: 'ADA', name: 'Cardano', aliases: [], words: ['cardano'], crypto: true },
  { code: 'USDT', name: 'Tether', aliases: [], words: ['tether'], crypto: true },
  { code: 'USDC', name: 'USD Coin', aliases: [], crypto: true },
  { code: 'SAT', name: 'Satoshi', symbol: 'sats', aliases: ['sats'], words: ['satoshi', 'satoshis'], crypto: true, decimals: 0 },
];

/** Offline fallback: units of currency per 1 USD (approximate, 2026). */
export const FALLBACK_RATES: Record<string, number> = {
  USD: 1, EUR: 0.86, GBP: 0.75, JPY: 150, CNY: 7.12, INR: 88.5, CAD: 1.39, AUD: 1.53,
  NZD: 1.74, HKD: 7.78, SGD: 1.3, MXN: 18.4, BRL: 5.4, CHF: 0.8, SEK: 9.45, NOK: 10.05,
  DKK: 6.42, PLN: 3.65, CZK: 20.9, HUF: 335, RUB: 81, TRY: 41.8, ILS: 3.3, KRW: 1420,
  TWD: 30.6, THB: 32.6, VND: 26300, IDR: 16550, MYR: 4.22, PHP: 58, ZAR: 17.4, AED: 3.6725,
  SAR: 3.75, QAR: 3.64, KWD: 0.306, EGP: 48, NGN: 1490, KES: 129, MAD: 9.1, PKR: 281,
  BDT: 122, UAH: 41.4, RON: 4.37, BGN: 1.68, ISK: 122, CLP: 950, COP: 3900, ARS: 1450, PEN: 3.45,
  // crypto: units per USD (i.e. 1 / price)
  BTC: 1 / 110000, ETH: 1 / 4000, SOL: 1 / 200, DOGE: 1 / 0.22, LTC: 1 / 100, XRP: 1 / 2.5,
  ADA: 1 / 0.7, USDT: 1, USDC: 1, SAT: 1e8 / 110000,
};

/** CoinGecko ids for live crypto prices. */
export const COINGECKO_IDS: Record<string, string> = {
  BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', DOGE: 'dogecoin', LTC: 'litecoin',
  XRP: 'ripple', ADA: 'cardano', USDT: 'tether', USDC: 'usd-coin',
};
