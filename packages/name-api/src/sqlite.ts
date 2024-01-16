import BetterSqlite3 from 'better-sqlite3';
import dotenv from 'dotenv';
dotenv.config();

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const EMPTY_CONTENT_HASH = '0x';

export class SQLiteDatabase {

  db: BetterSqlite3.Database;

  constructor(dbName: string) {
    this.db = new BetterSqlite3(dbName, { verbose: console.log });
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS names (
        name TEXT PRIMARY KEY,
        addresses TEXT,
        text TEXT,
        contenthash TEXT,
        chain_id INTEGER,
        token_id INTEGER,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP );
    `);
  }

  initDb() {
    const columnInfo = this.db.prepare("PRAGMA table_info(names)").all();
    // @ts-ignore
    const columnExists = columnInfo.some(column => column.name === 'token_id');

    if (!columnExists) {
      console.log("Column !exists");
      this.db.exec(`
      ALTER TABLE names
      ADD COLUMN token_id INTEGER;`);
    } else {
      console.log("Column exists");
    }
  }

  getAccountCount(): string {
    const count = this.db.prepare('SELECT COUNT(*) as count FROM names').get();
    // @ts-ignore
    return <string>count.count;
  }

  addr(name: string, coinType: number) {
    const row = this.db.prepare('SELECT addresses FROM names WHERE name = ?').get(name.toLowerCase());

    // @ts-ignore
    const addresses = row ? JSON.parse(row.addresses) : null;
    var useCoinType = coinType;

    // Grim hack: for our first experiments only coinType 60 worked due to only 0, 2, 3, 60, 61, 700 being supported by @ethersproject base-provider
    // In this experiment, we only return addresses intended for Polygon/ ENSIP-11, since all the addresses are stored as 60,
    // convert input ENSIP-11(MATIC) to 60, and input 60 to an unused value
    if (coinType == 0x80000089) {
      useCoinType = 60;
    } else if (coinType == 60) {
      useCoinType = -1; 
    } else if (coinType == 0) {
      return { addr: "MQMcJhpWHYVeQArcZR3sBgyPZxxRtnH441" };
    } else if (coinType == 2) {
      return { addr: "12cbQLTFMXRnSzktFkuoG3eHoMeFtpTu3S" };
    } else if (coinType == 0x8000003d ) {
      return { addr: "0x3fFB04c0065c97E165F94CC1AB3493da393C2D5F"};
    } else if (coinType == 0x80000064 ) {
      return { addr: "0x3fFB04c0065c97E165F94CC1AB3493da393C2D5F"};
    }

    if (!addresses || !addresses[useCoinType]) {
      return { addr: ZERO_ADDRESS };
    }

    return { addr: addresses[useCoinType] };
  }

  getTokenIdFromName(name: string): number {
    const row = this.db.prepare('SELECT token_id FROM names WHERE name = ?').get(name.toLowerCase());
    if (row) {
      // @ts-ignore
      return row.token_id;
    } else {
      return -1;
    }
  }

  getNameFromAddress(address: string): string | null {
    const row = this.db.prepare('SELECT name FROM names WHERE addresses LIKE ? ORDER BY createdAt DESC LIMIT 1').get(`%"${address}"%`);
    if (row) {
      // @ts-ignore
      return row.name;
    } else {
      return null;
    }
  }

  text(name: string, key: string) {
    const row = this.db.prepare('SELECT text FROM names WHERE name = ?').get(name.toLowerCase());

    console.log(row);

    // @ts-ignore
    const text = row ? JSON.parse(row.text) : null;

    if (!text || !text[key]) {
      return { value: '' };
    }

    return { value: text[key] };
  }

  contenthash(name: string) {
    const row = this.db.prepare('SELECT contenthash FROM names WHERE name = ?').get(name.toLowerCase());

    console.log(row);

    //const contenthash = row ? row.contenthash : null;
    const contenthash = null;

    if (!contenthash) {
      return { contenthash: EMPTY_CONTENT_HASH };
    }

    return { contenthash };
  }

  checkAvailable(name: string): boolean {
    const row = this.db.prepare('SELECT * FROM names WHERE name = ?').get(name.toLowerCase());
    return !row;
  }

  addElement(baseName: string, name: string, address: string, chainId: number, tokenId: number) {
    const santisedName = name.toLowerCase().replace(/\s+/g, '-').replace(/-{2,}/g, '').replace(/^-+/g, '').replace(/[;'"`\\]/g, '').replace(/^-+|-+$/g, '');
    const truncatedText = santisedName.slice(0, 42); // limit name to 255

    let fullName = truncatedText + '.' + baseName;

    const existingRow = this.db.prepare('SELECT * FROM names WHERE name = ? OR addresses LIKE ?').get(fullName, `%"${address}"%`);

    if (existingRow)
      throw new Error("Name already registered");

    const addresses = { 60: address };
    const contenthash = '0xe301017012204edd2984eeaf3ddf50bac238ec95c5713fb40b5e428b508fdbe55d3b9f155ffe';

    const stmt = this.db.prepare('INSERT INTO names (name, addresses, contenthash, chain_id, token_id) VALUES (?, ?, ?, ?, ?)');
    stmt.run(fullName, JSON.stringify(addresses), contenthash, chainId, tokenId);
  }
}
