import BetterSqlite3 from 'better-sqlite3';
import dotenv from 'dotenv';
import { getBaseName } from "./resolve";
import { getTokenBoundAccount } from "./tokenBound";
dotenv.config();

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const EMPTY_CONTENT_HASH = '0x';

const SMARTCAT_ETH = "thesmartcats.eth";
const SMARTCAT_TOKEN = "0xd5ca946ac1c1f24eb26dae9e1a53ba6a02bd97fe";

const ENSIP9: Record<number, number> = {
  60: 1,
  61: 61,
  614: 10,
  966: 137,
  700: 100,
  9001: 42161
}

var ENSIP9_REVERSE = new Map<number, number>();

export interface BaseNameDef {
  name: string,
  chainId: number,
  token: string
}

export class SQLiteDatabase {

  db: BetterSqlite3.Database;

  constructor(dbName: string) {
    this.db = new BetterSqlite3(dbName, { verbose: console.log });

    // this.db.exec(`
    //     DROP TABLE names;
    // `)
    
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS names (
        name TEXT PRIMARY KEY,
        text TEXT,
        contenthash TEXT,
        token_id INTEGER,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP );
    `);

    // this.db.exec(`
    //     DROP TABLE tokens;
    // `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tokens (
        name TEXT PRIMARY KEY,
        token TEXT,
        chain_id INTEGER,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
    `);

    // this.db.exec(`
    //     DROP TABLE address_overrides;
    // `)

    // this table is for if you want to set a specific ENS address for a given token
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS address_overrides (
        token_location TEXT PRIMARY KEY,
        address TEXT);
    `);
  }

  addressKey(name: string, chainId: number) {
    return `${name}-${chainId}`;
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

    // the addresses entry is now moved into a separate database, as it may not be used 
    // - if not used then we use the default 6551 implementation
    //        addresses TEXT,
    //migrate from old database
    // @ts-ignore
    const addressesExists = columnInfo.some(column => column.name === 'addresses');
    if (addressesExists) {
      console.log(`Migrate database to remove preset addresses`);
      this.db.exec(`
      CREATE TABLE IF NOT EXISTS names_temp (
        name TEXT PRIMARY KEY,
        text TEXT,
        contenthash TEXT,
        token_id INTEGER,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP );
    `);

      this.db.exec(`
            INSERT INTO names_temp (name, text, contenthash, token_id, createdAt)
            SELECT name, text, contenthash, token_id, createdAt
            FROM names;
        `);

      this.db.exec(`
            DROP TABLE names;
        `);

      this.db.exec(`
            ALTER TABLE names_temp RENAME TO names;
        `);
    }

    //now add thesmartcats.eth entry
    if (this.checkBaseNameAvailable(SMARTCAT_ETH)) {
      console.log(`Adding smartcats`);
      this.registerBaseDomain(SMARTCAT_ETH, SMARTCAT_TOKEN, 137);
    }

    this.setupENSIP9Reverse();
  }

  setupENSIP9Reverse() {
    for (const chainId in ENSIP9) {
      const ensip = ENSIP9[chainId];
      ENSIP9_REVERSE.set(ensip, parseInt(chainId, 10));
    }
  }

  getAccountCount(): string {
    const count = this.db.prepare('SELECT COUNT(*) as count FROM names').get();
    // @ts-ignore
    return <string>count.count;
  }

  applySCFix(coinType: number, name: string): number {
    let useCoinType = coinType;

    if (name.endsWith(SMARTCAT_ETH)) {
      // Grim hack: for our first experiments only coinType 60 worked due to only 0, 2, 3, 60, 61, 700 being supported by @ethersproject base-provider
      // In this experiment, we only return addresses intended for Polygon/ENSIP-11 & SLIP-44, since all the addresses are stored as 60,
      // convert input ENSIP-11(MATIC) to 60, and input 60 to an unused value
      if (coinType == 0x80000089 || coinType == 966) {
        useCoinType = 60;
      } else if (coinType == 60) {
        useCoinType = -1;
      }
    }

    return useCoinType;
  }

  addr(name: string, coinType: number) {
    const row = this.db.prepare('SELECT * FROM names WHERE name = ?').get(name.toLowerCase());
    const tokenRow = this.db.prepare('SELECT * FROM tokens WHERE name = ?').get(getBaseName(name));

    console.log(`ROW/TROW ${row} ${tokenRow}`);

    if (row == null || tokenRow == null) {
      return { addr: ZERO_ADDRESS }; 
    }

    // @ts-ignore
    const tokenId = row.token_id;

    // @ts-ignore
    const tokenContract = tokenRow.token;

    // @ts-ignore
    const tokenChainId = tokenRow.chain_id;
    const targetChainId = this.convertCoinTypeToEVMChainId(coinType);

    const addressOverride = this.db.prepare('SELECT address FROM address_overrides WHERE token_location = ?')
      .get(this.addressKey(name, targetChainId));

    //Rules: unless we have additional address in address_overrides then provide 6551 address only for the token chain
    if (addressOverride) {
      // @ts-ignore
      return { addr : addressOverride.address };
    } else if (tokenChainId == targetChainId || targetChainId == 1) {
      //calculate the 6551 address
      return { addr: getTokenBoundAccount(targetChainId, tokenContract, tokenId) };
    } else {
      return { addr: ZERO_ADDRESS };
    }
  }

  updateTokenId(name: string, tokenId: number) {
    const row = this.db.prepare('SELECT token_id FROM names WHERE name = ?').get(name.toLowerCase());

    // @ts-ignore
    if (!row || !row.token_id) {
      try {
        this.db.prepare('UPDATE names SET token_id = ? WHERE name = ?').run(tokenId, name.toLowerCase());
      } catch (error) {
        console.log(error);
      }
    }
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

  getTokenIdVsName(page: number, pageSize: number): string | null {
    const offset = page * pageSize;
    const rows = this.db.prepare('SELECT name, token_id FROM names ORDER BY name LIMIT ? OFFSET ?').all(pageSize, offset);
    var result = "";
    if (rows) {
      // @ts-ignore
      //convert into CSV
      for (const row of rows) {
        // @ts-ignore
        result += `${row.name}, ${row.token_id},`;
      }
    }

    if (result.length == 0) {
      result = "No further entries";
    }

    return result;
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

  //return db.getNameFromToken(chainid, address, tokenId);
  getNameFromToken(chainId: number, address: string, tokenId: number): string | null {

    const tokenRow = this.db.prepare('SELECT name FROM tokens WHERE token = ? AND chain_id = ?').get(address, chainId);

    // @ts-ignore
    const baseName = tokenRow.name;

    // now search for the tokenId
    const row = this.db.prepare('SELECT name FROM names WHERE name LIKE ? AND token_id = ?').get(`%"${baseName}"`, tokenId);

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

  addElement(name: string, address: string, chainId: number, tokenId: number) {
    //front name:
    const thisName = name.split('.')[0];
    const santisedName = thisName.toLowerCase().replace(/\s+/g, '-').replace(/-{2,}/g, '').replace(/^-+/g, '').replace(/[;'"`\\]/g, '').replace(/^-+|-+$/g, '');
    const truncatedText = santisedName.slice(0, 42); // limit name to 255

    let fullName = truncatedText + '.' + getBaseName(name);

    const existingRow = this.db.prepare('SELECT * FROM names WHERE name = ?').get(fullName);

    if (existingRow)
      throw new Error("Name already registered");

    const stmt = this.db.prepare('INSERT INTO names (name, contenthash, token_id) VALUES (?, ?, ?)');
    stmt.run(fullName, '', tokenId);

    if (address !== null) {
      //additional entry for address
      const addrExec = this.db.prepare('INSERT INTO address_overrides (token_location, address) VALUES (?, ?)');
      addrExec.run(this.addressKey(fullName, chainId), address);
    }
  }

  getTokenLocation(name: string): { chainId: number, tokenContract: string } {
    const tokenRow = this.db.prepare('SELECT * FROM tokens WHERE name = ?').get(getBaseName(name));

    var tokenContract: string = '';
    var chainId: number = 0;

    if (tokenRow !== null) {
      // @ts-ignore
      tokenContract = tokenRow.token;
      // @ts-ignore
      chainId = tokenRow.chain_id;
    }

    return { chainId, tokenContract };
  }

  //tokens
  checkBaseNameAvailable(baseName: string): boolean {
    try {
      const row = this.db.prepare('SELECT * FROM tokens WHERE name = ?').get(baseName.toLowerCase());
      return !row;
    } catch (error) {
      // @ts-ignore
      console.log(`${error.message}`);
      return true;
    }
  }

  checkTokenContractAlreadyRegistered(tokenContract: string) {
    try {
      const row = this.db.prepare('SELECT * FROM tokens WHERE addresses LIKE ?').get(tokenContract.toLowerCase());
      return !row;
    } catch (error) {
      return true;
    }
  }

  registerBaseDomain(baseName: string, tokenContract: string, chainId: number) {

    const existingRow = this.db.prepare('SELECT * FROM tokens WHERE name = ?').get(baseName);

    if (existingRow)
      throw new Error("Name or TokenContract already registered");

    const stmt = this.db.prepare('INSERT INTO tokens (name, token, chain_id) VALUES (?, ?, ?)');
    stmt.run(baseName, tokenContract, chainId);
  }

  getTokenDetails(baseName: string, chainId: number): BaseNameDef | null {
    const row = this.db.prepare('SELECT token FROM tokens WHERE name = ? AND chain_id = ?').get(baseName.toLowerCase(), chainId);

    if (row) {
      // @ts-ignore
      return { name: baseName, chainId, token: row.token };
    } else {
      return null;
    }
  }

  // @ts-ignore
  convertEVMChainIdToCoinType(chainId: number): number {
    return (0x80000000 | chainId) >>> 0 // treat as unsigned integer
  }

  // @ts-ignore
  convertCoinTypeToEVMChainId(coinType: number): number {
    //first see if it's a legacy value
    if ((coinType & 0x80000000) == 0) {
      //convert using lookup table
      return ENSIP9[coinType] ?? 0; // nullish operator for undefined result
    } else {
      return (0x7fffffff & coinType) >> 0
    }
  }

}
