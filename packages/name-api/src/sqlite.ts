import BetterSqlite3 from 'better-sqlite3';
import dotenv from 'dotenv';
import { getBaseName, getPrimaryName } from "./resolve";
import { getTokenBoundAccount } from "./tokenBound";
dotenv.config();

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const EMPTY_CONTENT_HASH = '0x';

const SMARTCAT_ETH = "thesmartcats.eth";
const SMARTCAT_TOKEN = "0xd5ca946ac1c1f24eb26dae9e1a53ba6a02bd97fe";
const SMARTCAT_TOKEN_OWNER = "0x9c4171b69E5659647556E81007EF941f9B042b1a";

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
  tokenContract: string
}

export class SQLiteDatabase {

  db: BetterSqlite3.Database;

  constructor(dbName: string) {
    this.db = new BetterSqlite3(dbName, { verbose: console.log });

    this.db.exec(`
      DROP TABLE names;
    `)

    this.db.exec(`
      DROP TABLE tokens;
    `)

    this.db.exec(`
      DROP TABLE address_overrides;
    `)

    this.db.exec(`
      DROP TABLE text_entries;
    `)
    
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS names (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        contenthash TEXT,
        token_id INTEGER,
        tokens_index INTEGER,
        owner TEXT,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP );
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        token TEXT,
        chain_id INTEGER,
        owner TEXT,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
    `);

    // this table is for if you want to set a specific ENS address for a given token
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS address_overrides (
        names_index INTEGER,
        chain_id INTEGER,
        address TEXT);
    `);

    // Text entries
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS text_entries (
        names_index INTEGER,
        key TEXT,
        value TEXT,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
    `);
  }

  addressKey(name: string, chainId: number) {
    return `${name}-${chainId}`;
  }

  // This migrates data from the existing database. Not needed after the first run
  initDb() {

    // add thesmartcats.eth entry
    if (!this.isBaseNameRegistered(137, SMARTCAT_ETH)) {
      console.log(`Adding smartcats`);
      this.registerBaseDomain(SMARTCAT_ETH, SMARTCAT_TOKEN, 137, SMARTCAT_TOKEN_OWNER);
    }

    //get the index of smartcats.eth
    const smartcatsIndex = this.getBaseNameIndex(137, SMARTCAT_TOKEN);

    console.log(`Smartcats index: ${smartcatsIndex}`);

    const columnInfo = this.db.prepare("PRAGMA table_info(names)").all();
    // @ts-ignore
    const columnExists = columnInfo.some(column => column.name === 'token_id');
    // @ts-ignore
    const columnNotExists = !columnInfo.some(column => column.name === 'id');
    // @ts-ignore
    const textExists = columnInfo.some(column => column.name === 'text');

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
    if (addressesExists || columnNotExists || textExists) {
      console.log(`Migrate database to remove preset addresses`);
      this.db.exec(`
      CREATE TABLE IF NOT EXISTS names_temp (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        contenthash TEXT,
        token_id INTEGER,
        tokens_index INTEGER,
        owner TEXT,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP );
    `);

    this.db.prepare(`
      INSERT INTO names_temp (name, contenthash, token_id, tokens_index, createdAt)
      SELECT name, contenthash, token_id, COALESCE(tokens_index, ?) AS tokens_index, createdAt FROM names
    `).run(smartcatsIndex);

      this.db.exec(`
            DROP TABLE names;
        `);

      this.db.exec(`
            ALTER TABLE names_temp RENAME TO names;
        `);
    }

    this.setupENSIP9Reverse();

    // now run through all entries in "names" table and strip the "name" entry so all the domains are only one name:
    const sql = `
        UPDATE names
        SET name = SUBSTR(name, 1, INSTR(name, '.') - 1)
        WHERE INSTR(name, '.') > 0;
    `;
    this.db.exec(sql);
    console.log("Domain names stripped.");
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

  getBaseNameIndex(chainId: number, tokenContract: string): number {
    const row = this.db.prepare('SELECT id FROM tokens WHERE token = ? AND chain_id = ?').get(tokenContract, chainId);
    if (row) {
      // @ts-ignore
      return row.id;
    } else {
      return -1;
    }
  }

  getBaseNameFromDB(chainId: number, tokenContract: string): string {
    const row = this.db.prepare('SELECT name FROM tokens WHERE token = ? AND chain_id = ?').get(tokenContract, chainId);
    if (row) {
      // @ts-ignore
      return row.name;
    } else {
      return "";
    }
  }

  // the Name input here is assumed to be the full ENS name eg: frodo.xnft.eth
  getTokensIndexFromName(chainId: number, name: string): number {
    var nname: string = getBaseName(name);
    var nchainId: number = chainId;
    const row = this.db.prepare('SELECT id FROM tokens WHERE name = ? AND chain_id = ?').get(nname, nchainId);
    if (row) {
      // @ts-ignore
      return row.id;
    } else {
      return -1;
    }
  }

  // name is full domain name eg joe.catcollection.xnft.eth
  addr(chainId: number, name: string, coinType: number) {
    //first get the base domain entry (ie catcollection.xnft.eth)
    const { row, tokenRow } = this.getTokenEntry(name, chainId);

    //console.log(`ROW/TROW ${JSON.stringify(row)} ${JSON.stringify(tokenRow)}`);

    if (row == null) {
      console.log("No row");
      return { addr: ZERO_ADDRESS };
    }

    // @ts-ignore
    const tokenId = row.token_id;

    // @ts-ignore
    const tokenContract = tokenRow.token;

    // @ts-ignore
    const tokenChainId = tokenRow.chain_id;
    const targetChainId = this.convertCoinTypeToEVMChainId(coinType);

    // @ts-ignore
    const addressOverride = this.db.prepare('SELECT address FROM address_overrides WHERE names_index = ? AND chain_id = ?').get(row.id, chainId);

    //Rules: unless we have additional address in address_overrides then provide 6551 address only for the token chain
    if (addressOverride) {
      console.log("Override");
      // @ts-ignore
      return { addr : addressOverride.address };
    } else if (tokenChainId == targetChainId || targetChainId == 1) {
      //calculate the 6551 address
      //console.log("TBA");
      return { addr: getTokenBoundAccount(targetChainId, tokenContract, tokenId) };
    } else {
      //console.log("ZERO ADDRESS");
      return { addr: ZERO_ADDRESS };
    }
  }

  // name is full domain name eg joe.catcollection.xnft.eth
  updateTokenId(chainId: number, name: string, tokenId: number) {
    const { row, tokenRow } = this.getTokenEntry(name, chainId);

    if (row) {
      try {
        // @ts-ignore
        this.db.prepare('UPDATE names SET token_id = ? WHERE name = ? AND tokens_index = ?').run(tokenId, getPrimaryName(name), tokenRow.id);
      } catch (error) {
        console.log(error);
      }
    }
  }

  getTokenIdFromName(chainId: number, name: string): number {
    const { row } = this.getTokenEntry(name, chainId);

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
        // pull the underlying token
        // @ts-ignore
        const tokenRow = this.db.prepare('SELECT * FROM tokens WHERE id = ?').get(row.tokens_index);
        // @ts-ignore
        let fullName = row.name + "." + tokenRow.name;
        // @ts-ignore
        result += `${fullName}, ${row.token_id},`;
      }
    }

    if (result.length == 0) {
      result = "No further entries";
    }

    return result;
  }

  getTokenEntry(name: string, chainId: number): {row: any, tokenRow: any} {
    const tokenRow = this.db.prepare('SELECT * FROM tokens WHERE name = ? AND chain_id = ?').get(getBaseName(name), chainId);

    if (tokenRow == null) { return { row: null, tokenRow: null }; }

    // now get the token row
    // @ts-ignore
    const row = this.db.prepare('SELECT * FROM names WHERE name = ? AND tokens_index = ?').get(getPrimaryName(name), tokenRow.id);

    return { row, tokenRow };
  }

  //return db.getNameFromToken(chainid, address, tokenId);
  getNameFromToken(chainId: number, address: string, tokenId: number): string | null {

    const tokenRow = this.db.prepare('SELECT id FROM tokens WHERE token = ? AND chain_id = ?').get(address, chainId);

    // @ts-ignore
    const baseName = tokenRow.name;

    // now search for the tokenId
    // @ts-ignore
    const row = this.db.prepare('SELECT name FROM names WHERE tokens_index = ? AND token_id = ?').get(tokenRow.id, tokenId);

    if (row) {
      // @ts-ignore
      return row.name;
    } else {
      return null;
    }
  }

  text(chainId: number, name: string, key: string) {
    const { row } = this.getTokenEntry(name, chainId);

    if (!row) {
      return '';
    } else {
      const textRow = this.db.prepare('SELECT * FROM text_entries WHERE names_index = ? AND key = ?').get(row.id, key.toLowerCase());
      // @ts-ignore
      console.log(`${name} ${key} ${JSON.stringify(textRow)}`);
      if (!textRow) {
        return '';
      } else {
        // @ts-ignore
        return textRow.value;
      }
    }
  }

  // @ts-ignore
  setText(chainId: number, name: string, key: string, value: string) {
    const { row } = this.getTokenEntry(name, chainId);

    if (!row) {
      return;
    }

    try {
      const textRow = this.db.prepare('SELECT * FROM text_entries WHERE names_index = ? AND key = ?').get(row.id, key.toLowerCase());
      if (!textRow) {
        const stmt = this.db.prepare('INSERT INTO text_entries (names_index, key, value) VALUES (?, ?, ?)');
        stmt.run(row.id, key.toLowerCase(), value);
      } else {
        const stmt = this.db.prepare('UPDATE text_entries SET value = ? WHERE names_index = ? AND key = ?');
        stmt.run(value, row.id, key.toLowerCase());
      }
    } catch (e) {
      console.log(`Error setting text ${e}`);
    }
  }

  contenthash(chainId: number, name: string) {
    var contenthash = EMPTY_CONTENT_HASH;

    try {
      const { row } = this.getTokenEntry(name, chainId);
      //console.log(`${JSON.stringify(row)}`);

      if (row && row.contenthash) {
        contenthash = row.contenthash;
      }
    } catch (e) {
      console.log(`Error: ${e}`);
    }

    return contenthash;
  }

  checkAvailable(chainId: number, name: string): boolean {
    //console.log(`checkAvailable ${chainId} : ${name}`);
    const tokenIndex = this.getTokensIndexFromName(chainId, name);
    if (tokenIndex >= 0) {
      const row = this.db.prepare('SELECT * FROM names WHERE name = ? AND tokens_index = ?').get(name, tokenIndex);
      return !row;
    } else {
      return false;
    }
  }

  //Structure:
  // 1. Can only register a base domain once per chain - and that base name can only be accessed from that chain (eg mainnet RPC using mainnet will use the mainnet resolver to resolve to this address)
  // 2. Can register a subdomain, which is owned by specific owner.
  // 3. If the subdomain is needed to have an additional address on a different chain; this must be explicitly specified, and can only be added by the owner of the original subdomain.

  addElement(name: string, address: string, chainId: number, tokenId: number, owner: string): boolean {

    const baseName = getBaseName(name);

    //first get the base name index, from the supplying chain and the base name
    console.log(`addElement ${chainId} : ${name} ${getPrimaryName(name)}`);
    const baseNameIndex = this.getTokensIndexFromName(chainId, name);
    //const retrieveBaseName = this.getBaseName(chainId, address);

    if (baseNameIndex == -1) {
      console.log(`BaseName ${baseName} not registered on the server, cannot create this domain name`);
      return false;
    }

    const existingRow = this.db.prepare('SELECT * FROM names WHERE tokens_index = ? AND name = ?').get(baseNameIndex, getPrimaryName(name));

    //this request can be passed, providing the owner is the same as the exising owner
    if (existingRow) {
      // @ts-ignore
      if (existingRow.owner == owner) {
        const nameId = this.getNameIndex(baseNameIndex, name);
        //simply add a new address for the required chain
        const addrExec = this.db.prepare('INSERT INTO address_overrides (names_index, address, chain_id) VALUES (?, ?, ?)');
        addrExec.run(nameId, address, chainId);
        return true;

      } else {
        throw new Error("Name already registered");
      }
    }

    const stmt = this.db.prepare('INSERT INTO names (name, token_id, tokens_index, owner) VALUES (?, ?, ?, ?)');
    stmt.run(getPrimaryName(name), tokenId, baseNameIndex, owner);

    if (address !== null && address.length > 0) {
      const nameId = this.getNameIndex(baseNameIndex, name);
      //additional entry for address
      const addrExec = this.db.prepare('INSERT INTO address_overrides (names_index, address, chain_id) VALUES (?, ?, ?)');
      addrExec.run(nameId, address, chainId);
    }

    return true;
  }

  updateTokenOwner(name: string, chainId: number, owner: string) {
    console.log(`Updating owner for ${name} ${chainId} ${owner}`);

    const { row } = this.getTokenEntry(name, chainId);

    if (row) {
      this.db.prepare('UPDATE names SET owner = ? WHERE id = ?').run(owner, row.id);
      console.log(`Updated owner for ${name} ${chainId} ${owner}`);
    } else {
      console.log(`Couldn't find name ${name} ${chainId}`);
    }
  }

  getNameIndex(baseNameIndex: number, truncatedName: string): number {
    const row = this.db.prepare('SELECT id FROM names WHERE name = ? AND tokens_index = ?').get(truncatedName, baseNameIndex);
    if (row) {
      // @ts-ignore
      return row.id;
    } else {
      return -1;
    }
  }

  addStorage(ipfsHash: string, chainId: number, name: string) {

    const { row } = this.getTokenEntry(name, chainId);

    if (!row) {
      console.log(`${name} not registered on the server, cannot update this record`);
      return;
    }

    try {
      this.db.prepare('UPDATE names SET contenthash = ? WHERE id = ?').run(ipfsHash, row.id);
    } catch (error) {
      console.log(error);
    }
  }

  getTokenLocation(chainId: number, name: string): { chainId: number, tokenContract: string } {
    const { tokenRow } = this.getTokenEntry(name, chainId);

    var tokenContract: string = '';
    var chainId: number = 0;

    if (tokenRow !== undefined) {
      // @ts-ignore
      tokenContract = tokenRow.token;
      // @ts-ignore
      chainId = tokenRow.chain_id;
    }

    return { chainId, tokenContract };
  }

  //tokens
  isBaseNameRegistered(chainId: number, baseName: string): boolean {
    try { 
      const row = this.db.prepare('SELECT * FROM tokens WHERE name = ? AND chain_id = ?').get(baseName.toLowerCase(), chainId);
      return (row !== undefined);
    } catch (error) {
      // @ts-ignore
      console.log(`${error.message}`);
      return false;
    }
  }

  getTokenContractRegistered(chainId: number, tokenContract: string): boolean {
    try {
      const row = this.db.prepare('SELECT * FROM tokens WHERE chain_id = ? AND token LIKE ?').get(chainId, tokenContract.toLowerCase());
      console.log(`${tokenContract} ${row} ${row !== undefined}`);
      return (row !== undefined);
    } catch (error) {
      return false;
    }
  }

  registerBaseDomain(baseName: string, tokenContract: string, chainId: number, owner: string) {

    if (this.isBaseNameRegistered(chainId, baseName)) {
      console.log(`BaseName ${baseName} already registered on the server, cannot create this domain name`);
      return;
    }

    const stmt = this.db.prepare('INSERT INTO tokens (name, token, chain_id, owner) VALUES (?, ?, ?, ?)');
    stmt.run(baseName, tokenContract, chainId, owner);
  }

  getTokenDetails(chainId: number, baseName: string): BaseNameDef | null {
    const row = this.db.prepare('SELECT token FROM tokens WHERE name = ? AND chain_id = ?').get(baseName.toLowerCase(), chainId);

    if (row) {
      // @ts-ignore
      return { name: baseName, chainId, tokenContract: row.token };
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
}
