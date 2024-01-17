import BetterSqlite3 from 'better-sqlite3';
import dotenv from 'dotenv';
import csv from 'csv-parser';
import { Readable } from 'stream';
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
      console.log("Updating to add tokenId");
      this.db.exec(`
      ALTER TABLE names
      ADD COLUMN token_id INTEGER;`);
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
    // In this experiment, we only return addresses intended for Polygon/ENSIP-11 & SLIP-44, since all the addresses are stored as 60,
    // convert input ENSIP-11(MATIC) to 60, and input 60 to an unused value
    if (coinType == 0x80000089 || coinType == 966) {
      useCoinType = 60;
    } else if (coinType == 60) {
      useCoinType = -1; 
    } 

    if (!addresses || !addresses[useCoinType]) {
      return { addr: ZERO_ADDRESS };
    }

    return { addr: addresses[useCoinType] };
  }

  // @ts-ignore
  setTokenId(domainName: string, chainId: number, tokensCSV: string) {

    Readable.from(tokensCSV)
      .pipe(csv())
      .on('data', (row: string) => {
        //handle each data element:
        //1. calculate TBA using domain name and chainId
        //2. find corresponding entry in DB
        //3. update DB element if found
        console.log(row);
      })
      .on('end', () => {
        return "complete";
      });
  }

  // @ts-ignore
  updateTokenId(name: string, tokenId: number) {
    const row = this.db.prepare('SELECT token_id FROM names WHERE name = ?').get(name.toLowerCase());
    
    // @ts-ignore
    console.log("TokenId: " + row.token_id);
    // @ts-ignore
    if (!row || !row.token_id) {
      console.log("Not there");
    } else {
      console.log("There");
    }
    /*if (row) {
      // @ts-ignore
      this.db.prepare('UPDATE names SET tokenId = ? WHERE addresses LIKE ?').run(tokenId, `%"${address}"%`);
      return row.name;
    } else {
      return null;
    }*/
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

  // @ts-ignore
  addElement(baseName: string, name: string, address: string, chainId: number, tokenId: number) {
    const santisedName = name.toLowerCase().replace(/\s+/g, '-').replace(/-{2,}/g, '').replace(/^-+/g, '').replace(/[;'"`\\]/g, '').replace(/^-+|-+$/g, '');
    const truncatedText = santisedName.slice(0, 42); // limit name to 255

    let fullName = truncatedText + '.' + baseName;

    const existingRow = this.db.prepare('SELECT * FROM names WHERE name = ? OR addresses LIKE ?').get(fullName, `%"${address}"%`);

    if (existingRow)
      throw new Error("Name already registered");

    const addresses = { 60: address };
    const contenthash = '0xe301017012204edd2984eeaf3ddf50bac238ec95c5713fb40b5e428b508fdbe55d3b9f155ffe';

    //const stmt = this.db.prepare('INSERT INTO names (name, addresses, contenthash, chain_id, token_id) VALUES (?, ?, ?, ?, ?)');
    //stmt.run(fullName, JSON.stringify(addresses), contenthash, chainId, tokenId);
    const stmt = this.db.prepare('INSERT INTO names (name, addresses, contenthash, chain_id) VALUES (?, ?, ?, ?)');
    stmt.run(fullName, JSON.stringify(addresses), contenthash, chainId);
    
  }
}
