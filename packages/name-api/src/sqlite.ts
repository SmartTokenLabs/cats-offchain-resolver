import BetterSqlite3 from 'better-sqlite3';
import { getBaseName, getPrimaryName, CHAIN_ID } from "./resolve";
import { getTokenBoundAccount } from "./tokenBound";
import { RELEASE_MODE } from "./constants";

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const EMPTY_CONTENT_HASH = '0x';

export const SMARTCAT_ETH = "thesmartcats.eth";
export const SMARTCAT_TOKEN = "0xd5ca946ac1c1f24eb26dae9e1a53ba6a02bd97fe";
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

let releaseMode = true;

function consoleLog(query: any) {
  if (!releaseMode) {
    console.log(query);
  }
}

export class SQLiteDatabase {

  db: BetterSqlite3.Database;

  constructor(dbName: string) {
    this.db = new BetterSqlite3(dbName, { verbose: consoleLog });

    /*this.db.exec(`
      DROP TABLE IF EXISTS names;
    `)*/

    /*this.db.exec(`
      DROP TABLE IF EXISTS tokens;
    `)*/

    /*
    this.db.exec(`
      DROP TABLE IF EXISTS address_overrides;
    `)

    this.db.exec(`
      DROP TABLE IF_EXISTS text_entries;
    `)*/

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

    // Individual entry NFT names
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS names_nft (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        contenthash TEXT,
        token TEXT,
        token_id INTEGER,
        chain_id INTEGER,
        resolver_chain INTEGER,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP );
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        token TEXT,
        chain_id INTEGER,
        resolver_chain INTEGER,
        owner TEXT,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
    `);

    // this table is for if you want to set a specific ENS address for a given token.
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

    //get the index of smartcats.eth
    var smartcatsIndex = this.getBaseNameIndex(137, SMARTCAT_TOKEN);

    const tokensColumns = this.db.prepare("PRAGMA table_info(tokens)").all();
    // @ts-ignore
    const tokensResolverChainExists = tokensColumns.some(column => column.name === 'resolver_chain');

    if (!tokensResolverChainExists) {
      //drop tables here
      consoleLog("Updating to add resolver_chain");

      this.db.exec(`
      ALTER TABLE tokens
      ADD COLUMN resolver_chain INTEGER;`);

      if (smartcatsIndex != -1) {
        // @ts-ignore
        this.db.prepare('UPDATE tokens SET resolver_chain = ? WHERE id = ?').run(CHAIN_ID.mainnet, smartcatsIndex);
      }
    }

    const deleteStmt = this.db.prepare(`DELETE FROM tokens WHERE name LIKE ?`);
    const info = deleteStmt.run(`%.nft`);
    consoleLog(`Deleted ${info.changes} entries`);

    //dump all tokens
    const csv = this.db.prepare('SELECT * FROM tokens ORDER BY name').all();
    for (const row of csv) {
      // @ts-ignore
      consoleLog(`TOKEN: ${row.name},${row.token},${row.chain_id},${row.resolver_chain}`);
    }

    // add thesmartcats.eth entry if required
    if (smartcatsIndex == -1) {
      consoleLog(`Adding smartcats`);
      this.registerBaseDomain(SMARTCAT_ETH, SMARTCAT_TOKEN, CHAIN_ID.polygon, 1, SMARTCAT_TOKEN_OWNER);
      smartcatsIndex = this.getBaseNameIndex(CHAIN_ID.polygon, SMARTCAT_TOKEN);
    }

    //get the index of smartcats.eth
    //const smartcatsIndex = this.getBaseNameIndex(137, SMARTCAT_TOKEN);

    //const csv = this.db.prepare('SELECT * FROM names ORDER BY name').all();
    //consoleLog(`${csv.length} entries ${JSON.stringify(csv)}`);

    releaseMode = true;

    consoleLog(`Smartcats index: ${smartcatsIndex}`);

    const columnInfo = this.db.prepare("PRAGMA table_info(names)").all();
    // @ts-ignore
    const columnExists = columnInfo.some(column => column.name === 'token_id');
    // @ts-ignore
    const columnNotExists = !columnInfo.some(column => column.name === 'id');
    // @ts-ignore
    const textExists = columnInfo.some(column => column.name === 'text');
    // @ts-ignore
    const tokensIndexExists = columnInfo.some(column => column.name === 'tokens_index');

    this.setupENSIP9Reverse();

    consoleLog(`entries: ${JSON.stringify(columnInfo)} columnExists ${columnExists} columnNotExists ${columnNotExists} textExists ${textExists} tokensIndexExists ${tokensIndexExists}`);

    if (!columnExists) {
      consoleLog("Updating to add tokenId");
      this.db.exec(`
      ALTER TABLE names
      ADD COLUMN token_id INTEGER;`);
    }

    const csv2 = this.db.prepare('SELECT * FROM names ORDER BY name').all();
    consoleLog(`${csv2.length} entries2`);

    // the addresses entry is now moved into a separate database, as it may not be used 
    // - if not used then we use the default 6551 implementation
    //        addresses TEXT,
    //migrate from old database
    // @ts-ignore
    const addressesExists = columnInfo.some(column => column.name === 'addresses');
    if (addressesExists || columnNotExists || textExists) {
      consoleLog(`Migrate database to remove preset addresses`);
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


      //need to move

      if (!tokensIndexExists) {
        consoleLog("Updating to add tokens_index");

        this.db.prepare(`
        INSERT INTO names_temp (name, contenthash, token_id, tokens_index, createdAt)
        SELECT name, ? AS contenthash, token_id, ? AS tokens_index, createdAt FROM names
      `).run("", smartcatsIndex);

        consoleLog("Updating to add addresses");
        // one-by-one, find all entries in "names" table that do not have a token_id, and add a new entry in "address_overrides" table with the address extracted from the "addresses" JSON
        const entries = this.db.prepare('SELECT * FROM names WHERE token_id IS NULL').all();
        consoleLog(`${entries.length} entries3`);

        for (const row of entries) {
          // @ts-ignore
          const address = row.addresses;
          if (address) {
            //no token_id, so we need to add an address override
            const addresses = JSON.parse(address);
            // @ts-ignore
            //consoleLog(`${row.name} ${JSON.stringify(addresses)}`);
            const addr60 = addresses[60];
            if (addr60) {
              //enter this in address_overrides table, can now fix it, as SMARTCATS is 137
              //now look up the entry in the names_temp table
              // @ts-ignore
              const newEntry = this.db.prepare('SELECT * FROM names_temp WHERE name = ?').get(row.name);
              // @ts-ignore
              //consoleLog(`${row.name} ${newEntry.id} ${ensip9Chain} ${addr60}`);
              const addrExec = this.db.prepare('INSERT INTO address_overrides (names_index, address, chain_id) VALUES (?, ?, ?)');
              // @ts-ignore
              addrExec.run(newEntry.id, addr60, 137);
            } else {
              // @ts-ignore
              consoleLog(`${row.name} no 60 address`);
            }
          }
        }

      } else {
        this.db.prepare(`
        INSERT INTO names_temp (name, contenthash, token_id, tokens_index, createdAt)
        SELECT name, contenthash, token_id, COALESCE(tokens_index, ?) AS tokens_index, createdAt FROM names
      `).run(smartcatsIndex);
      }

      this.db.exec(`
            DROP TABLE names;
        `);

      this.db.exec(`
            ALTER TABLE names_temp RENAME TO names;
        `);
    }

    // now run through all entries in "names" table and strip the "name" entry so all the domains are only one name:
    const sql = `
        UPDATE names
        SET name = SUBSTR(name, 1, INSTR(name, '.') - 1)
        WHERE INSTR(name, '.') > 0;
    `;
    this.db.exec(sql);
    consoleLog("Domain names stripped.");

    // for debugging
    //this.dumpNames();

    releaseMode = (RELEASE_MODE == "true");
  }

  getTableDump(): string {
    const csv = this.db.prepare('SELECT * FROM names ORDER BY name').all();

    consoleLog(`${csv.length} entries`);
    // @ts-ignore
    const csvString = csv.map(row => `${row.name},${row.token_id},${row.tokens_index}`).join('\n');
    return csvString;
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

  // name is full domain name eg joe.catcollection.xnft.eth, coinType is the ENSIP9 chain id
  addr(chainId: number, name: string, coinType: number) {
    //first get the base domain entry (ie catcollection.xnft.eth)
    const { row, tokenRow } = this.getTokenEntry(name, chainId);
    var coinChainId = this.convertCoinTypeToEVMChainId(coinType);

    const nftTokenRow = this.db.prepare('SELECT * FROM names_nft WHERE name = ? AND chain_id = ? AND resolver_chain = ?').get(name, coinChainId, chainId);

    if (nftTokenRow) {
      consoleLog(`nftTokenRow: ${JSON.stringify(nftTokenRow)} TBA`);
      // @ts-ignore
      return { addr: getTokenBoundAccount(coinChainId, nftTokenRow.token, nftTokenRow.token_id) };
    }

    consoleLog(`ROW/TROW ${JSON.stringify(row)} ${JSON.stringify(tokenRow)} ${coinType}`);

    if (row == null) {
      consoleLog("No row");
      return { addr: ZERO_ADDRESS };
    }

    // @ts-ignore
    const tokenId = row.token_id;

    // @ts-ignore
    const tokenContract = tokenRow.token;

    // @ts-ignore
    const tokenChainId = tokenRow.chain_id;

    //testnets should return address with a default query
    if (coinChainId == CHAIN_ID.mainnet && chainId != CHAIN_ID.mainnet) {
      coinChainId = chainId; //Note this will match the tokenChainId if the setup is correct (ie during registration the chainId was given correctly. Note that registration checks the validity of the ENS setup).
    }

    consoleLog(`addr ${name} ${coinType} ${tokenId} ${tokenContract} ${chainId} ${tokenChainId} ${coinChainId}`);

    // @ts-ignore
    const addressOverride = this.db.prepare('SELECT address FROM address_overrides WHERE names_index = ? AND chain_id = ?').get(row.id, coinChainId); //use EVM chainId in database

    //Rules: unless we have additional address in address_overrides then provide 6551 address only for the token chain
    if (addressOverride) {
      consoleLog("Override");
      // @ts-ignore
      return { addr: addressOverride.address };
    } else if (tokenChainId == coinChainId) {
      //calculate the 6551 address for the chainId of the token
      consoleLog("TBA");
      return { addr: getTokenBoundAccount(coinChainId, tokenContract, tokenId) };
    } else {
      //consoleLog("ZERO ADDRESS");
      return { addr: ZERO_ADDRESS };
    }
  }

  // name is full domain name eg joe.catcollection.xnft.eth
  updateTokenId(chainId: number, name: string, tokenId: number) {
    const { row } = this.getTokenEntry(name, chainId);

    consoleLog(`updateTokenId ${name} ${tokenId} ${JSON.stringify(row)}`);

    if (row) {
      try {
        //does this row need tokenId update?
        if (!row.token_id) {
          consoleLog(`updateTokenId2 ${name} ${tokenId} ${JSON.stringify(row)}`);
          // @ts-ignore
          this.db.prepare('UPDATE names SET token_id = ? WHERE id = ?').run(tokenId, row.id);
        }

      } catch (error) {
        consoleLog(error);
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

  getTokenEntry(name: string, chainId: number): { row: any, tokenRow: any } {
    let tokenRow = this.db.prepare('SELECT * FROM tokens WHERE name = ? AND resolver_chain = ?').get(getBaseName(name), chainId);

    if (tokenRow == null) { return { row: null, tokenRow: null }; }

    // now get the token row
    // @ts-ignore
    const row = this.db.prepare('SELECT * FROM names WHERE name = ? AND tokens_index = ?').get(getPrimaryName(name), tokenRow.id);

    return { row, tokenRow };
  }

  //has this tokenId registered a name for this domain?
  isTokenIdRegistered(chainId: number, tokenContract: string, tokenId: string): boolean {
    const tokenRow = this.db.prepare('SELECT * FROM tokens WHERE token = ? AND chain_id = ?').get(tokenContract, chainId);
    // @ts-ignore
    const row = this.db.prepare('SELECT * FROM names WHERE token_id = ? AND tokens_index = ?').get(tokenId, tokenRow.id);
    return row !== undefined;
  }

  //return db.getNameFromToken(chainid, address, tokenId);
  getNameFromToken(chainId: number, address: string, tokenId: number): string | null {

    const tokenRow = this.db.prepare('SELECT id FROM tokens WHERE token = ? AND chain_id = ?').get(address, chainId);

    // @ts-ignore
    const baseName = tokenRow.name;

    // now search for the tokenId
    // @ts-ignore
    const row = this.db.prepare('SELECT name FROM names WHERE tokens_index = ? AND token_id = ?').get(tokenRow.id, tokenId);

    consoleLog(`getNameFromToken ${chainId} ${address} ${tokenId} ${JSON.stringify(row)}`);

    if (row) {
      // @ts-ignore
      return row.name;
    } else {
      return null;
    }
  }

  text(chainId: number, name: string, key: string) {

    consoleLog(`text ${chainId} ${name} ${key}`);
    const { row } = this.getTokenEntry(name, chainId);

    consoleLog(`tokenRow ${JSON.stringify(row)}`);

    if (!row) {
      return '';
    } else {
      const textRow = this.db.prepare('SELECT * FROM text_entries WHERE names_index = ? AND key = ?').get(row.id, key.toLowerCase());
      // @ts-ignore
      consoleLog(`${name} ${key} ${JSON.stringify(textRow)}`);
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
    consoleLog(`setText ${chainId} ${name} ${key} ${value}`);
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
      consoleLog(`Error setting text ${e}`);
    }
  }

  contenthash(chainId: number, name: string) {
    var contenthash = EMPTY_CONTENT_HASH;

    try {
      const { row } = this.getTokenEntry(name, chainId);
      consoleLog(`${JSON.stringify(row)}`);

      if (row && row.contenthash) {
        contenthash = row.contenthash;
      }
    } catch (e) {
      consoleLog(`Error: ${e}`);
    }

    return contenthash;
  }

  checkAvailable(chainId: number, name: string): boolean {
    const { row } = this.getTokenEntry(name, chainId);
    return row == undefined;
  }

  // This check is to prevent name grabbing - one an NFT is registered, further names cannot be registered by the same NFT
  checkExisting(chainId: number, ensChainId: number, tokenAddress: string, tokenId: number): string | null {
    consoleLog(`checkExisting ${chainId} ${ensChainId} ${tokenAddress} ${tokenId}`);
    const tokenRows = this.db.prepare('SELECT * FROM tokens WHERE token = ? AND chain_id = ? AND resolver_chain = ?').all(tokenAddress, chainId, ensChainId);
    const nftTokenRow = this.db.prepare('SELECT * FROM names_nft WHERE token = ? AND token_id = ? AND chain_id = ? AND resolver_chain = ?').get(tokenAddress, tokenId, chainId, ensChainId);

    // There may be 2 rows (one for token registration one for NFT reg), need to check both of them
    if (tokenRows) {
      for (const row of tokenRows) {
        // @ts-ignore
        consoleLog(`TOKEN CHECK: ${row.name},${row.token},${row.chain_id},${row.resolver_chain}`);
        // check for tokenId
        // @ts-ignore
        const instanceRow = this.db.prepare('SELECT * FROM names WHERE token_id = ? AND tokens_index = ?').get(tokenId, row.id);
        if (instanceRow) {
          // @ts-ignore
          consoleLog(`TOKEN ID CHECK: ${instanceRow.name},${instanceRow.token_id},${instanceRow.tokens_index}`);
          // @ts-ignore
          return instanceRow.name + "." + row.name;
        }
      }
    }

    if (nftTokenRow) {
      consoleLog(`nftTokenRow: ${JSON.stringify(nftTokenRow)}`);
      // @ts-ignore
      return nftTokenRow.name;
    }

    return null;
  }

  checkNFTNameAvailable(name: string, ensChainId: number): boolean {

    const nftTokenRow = this.db.prepare('SELECT * FROM names_nft WHERE name = ? AND resolver_chain = ?').get(name, ensChainId);
    const { row } = this.getTokenEntry(name, ensChainId);
    const baseRow = this.db.prepare('SELECT * FROM tokens WHERE name = ? AND resolver_chain = ?').get(name, ensChainId); //cannot be a base name

    //also check the full name isn't a base name
    if (row != undefined || nftTokenRow || baseRow) {
      // this corresponds to an actual registered token name or NFT base name, must fail
      return false;
    }

    return true;
  }

  //Structure:
  // 1. Can only register a base domain once per chain - and that base name can only be accessed from that chain (eg mainnet RPC using mainnet will use the mainnet resolver to resolve to this address)
  // 2. Can register a subdomain, which is owned by specific owner.
  // 3. If the subdomain is needed to have an additional address on a different chain; this must be explicitly specified, and can only be added by the owner of the original subdomain.

  addElement(name: string, address: string, chainId: number, tokenId: number, owner: string, ensChainId: number): boolean {

    const baseName = getBaseName(name);

    //first get the base name index, from the supplying chain and the base name
    consoleLog(`addElement ${chainId} : ${name} ${getPrimaryName(name)}`);
    const baseNameIndex = this.getTokensIndexFromName(chainId, name);
    //const retrieveBaseName = this.getBaseName(chainId, address);

    if (baseNameIndex == -1) {
      consoleLog(`BaseName ${baseName} not registered on the server, cannot create this domain name`);
      return false;
    }

    const existingRow = this.db.prepare('SELECT * FROM names WHERE tokens_index = ? AND name = ?').get(baseNameIndex, getPrimaryName(name));

    //this request can be passed, providing the owner is the same as the exising owner
    if (existingRow) {
      // @ts-ignore
      if (existingRow.owner == owner) {
        const nameId = this.getNameIndex(baseNameIndex, name);
        //simply add a new address for the required chain
        var useEnsChainId = ensChainId == 0 ? chainId : ensChainId;
        const addrExec = this.db.prepare('INSERT INTO address_overrides (names_index, address, chain_id) VALUES (?, ?, ?)');
        addrExec.run(nameId, address, useEnsChainId);
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

  registerNFT(name: string, chainId: number, tokenAddress: string, tokenId: number, ensChainId: number): boolean {

    //first get the base name index, from the supplying chain and the base name
    consoleLog(`registerNFT ${chainId} : ${name} ${getPrimaryName(name)}`);
    let tokenRow = this.db.prepare('SELECT * FROM names_nft WHERE name = ? AND chain_id = ? AND resolver_chain = ?').get(name, chainId, ensChainId);

    if (!tokenRow) {
      const stmt = this.db.prepare('INSERT INTO names_nft (name, token, chain_id, token_id, resolver_chain) VALUES (?, ?, ?, ?, ?)');
      stmt.run(name, tokenAddress, chainId, tokenId, ensChainId);
    } else {
      // @ts-ignore
      consoleLog(`registerNFT Existing base ${chainId} : ${baseName} ${ensChainId} ${tokenRow.id} }`);
      return false;
    }

    return true;
  }

  updateTokenOwner(name: string, chainId: number, owner: string) {
    consoleLog(`Updating owner for ${name} ${chainId} ${owner}`);

    const { row } = this.getTokenEntry(name, chainId);

    if (row) {
      this.db.prepare('UPDATE names SET owner = ? WHERE id = ?').run(owner, row.id);
      consoleLog(`Updated owner for ${name} ${chainId} ${owner}`);
    } else {
      consoleLog(`Couldn't find name ${name} ${chainId}`);
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
      consoleLog(`${name} not registered on the server, cannot update this record`);
      return;
    }

    try {
      this.db.prepare('UPDATE names SET contenthash = ? WHERE id = ?').run(ipfsHash, row.id);
    } catch (error) {
      consoleLog(error);
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

  // For thesmartcats only
  getNameFromAddress(address: string, tokenId: number): string | null {
    try {
      const smartcatsIndex = this.getBaseNameIndex(137, SMARTCAT_TOKEN);
      const tokenRow = this.db.prepare('SELECT * FROM tokens WHERE id = ?').get(smartcatsIndex);
      const addressOverrideEntry = this.db.prepare('SELECT * FROM address_overrides WHERE address = ? AND chain_id = ?').get(address, 137); //must be unique for the chain
      var row;
      if (!addressOverrideEntry) {
        consoleLog(`Get row from tokenId ${tokenId}`);
        row = this.db.prepare('SELECT * FROM names WHERE token_id = ? AND tokens_index = ?').get(tokenId, smartcatsIndex);
      } else {
        // use addressOverrideEntry
        // @ts-ignore
        row = this.db.prepare('SELECT * FROM names WHERE id = ?').get(addressOverrideEntry.names_index);
        consoleLog(`Get row from addressOverride ${tokenId} ${JSON.stringify(addressOverrideEntry)}`);
      }
      if (row) {
        consoleLog(`${address} ${JSON.stringify(row)}`);
        consoleLog(`${address} ${JSON.stringify(tokenRow)}`);
        //get basename
        // @ts-ignore
        consoleLog(`${row.name}.${tokenRow.name}`);
        // @ts-ignore
        return `${row.name}.${tokenRow.name}`;
      } else {
        return null;
      }
    } catch (error) {
      consoleLog(`Error: ${error}`);
      return null;
    }
  }

  //tokens
  isBaseNameRegistered(chainId: number, ensChainId: number, baseName: string): boolean {
    try {
      const row = this.db.prepare('SELECT * FROM tokens WHERE name = ? AND chain_id = ? AND resolver_chain = ?').get(baseName.toLowerCase(), chainId, ensChainId);
      consoleLog(`isBaseNameRegistered ${baseName} ${JSON.stringify(row)}`);
      return (row !== undefined);
    } catch (error) {
      // @ts-ignore
      consoleLog(`${error.message}`);
      return false;
    }
  }

  getTokenContractRegistered(chainId: number, ensChainId: number, tokenContract: string): boolean {
    try {
      const row = this.db.prepare('SELECT * FROM tokens WHERE chain_id = ? AND resolver_chain = ? AND token LIKE ?').get(chainId, ensChainId, tokenContract.toLowerCase());
      consoleLog(`${tokenContract} ${row} ${row !== undefined}`);
      return (row !== undefined);
    } catch (error) {
      return false;
    }
  }

  //(name, tokenContract, numericChainId, numericEnsChainId, applyerAddress);
  registerBaseDomain(baseName: string, tokenContract: string, chainId: number, ensChainId: number, owner: string) {

    if (this.isBaseNameRegistered(chainId, ensChainId, baseName)) {
      consoleLog(`BaseName ${baseName} already registered on the server, cannot create this domain name`);
      return;
    }

    //check for chain/token clash:
    if (this.getBaseNameIndex(chainId, tokenContract) != -1) {
      consoleLog(`BaseName ${baseName} clash with existing token: this would create ambiguity.`);
      return;
    }

    const stmt = this.db.prepare('INSERT INTO tokens (name, token, chain_id, resolver_chain, owner) VALUES (?, ?, ?, ?,?)');
    stmt.run(baseName, tokenContract, chainId, ensChainId, owner);
  }

  getTokenDetails(chainId: number, ensChainId: number, baseName: string): BaseNameDef | null {
    consoleLog(`getTokenDetails ${chainId} ${ensChainId} ${baseName}`);
    const row = this.db.prepare('SELECT token FROM tokens WHERE name = ? AND chain_id = ? AND resolver_chain = ?').get(baseName.toLowerCase(), chainId, ensChainId);

    if (row) {
      // @ts-ignore
      return { name: baseName, chainId, tokenContract: row.token };
    } else {
      return { name: "", chainId: 0, tokenContract: "" };
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
      return ENSIP9[coinType] ?? coinType; // just return the chainId if not found in the list
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


  dumpNames() {
    // dump 100 names with tokenId, 100 without
    const csv4 = this.db.prepare('SELECT * FROM names ORDER BY id').all();
    var count1: number = 0;
    var count2: number = 0;
    for (const row of csv4) {
      // @ts-ignore
      if (row.token_id && count1 < 100) {
        // @ts-ignore
        const tbaAddr = getTokenBoundAccount(137, SMARTCAT_TOKEN, row.token_id)
        // @ts-ignore
        consoleLog(`* ${row.name}, ${row.token_id}, ${tbaAddr}`);
        count1++;
        // @ts-ignore
      } else if (row.token_id === null && count2 < 100) {

        // look up address_entry
        // @ts-ignore
        const addressOverrideEntry = this.db.prepare('SELECT * FROM address_overrides WHERE names_index = ? AND chain_id = ?').get(row.id, 137);

        if (addressOverrideEntry) {
          // @ts-ignore
          consoleLog(`- ${row.name} ${addressOverrideEntry.address}`);
        } else {
          // @ts-ignore
          consoleLog(`- ${row.name} no address ${ENSIP9_REVERSE.get(137)}`);
        }
        count2++;
      }

      if (count1 >= 100 && count2 >= 100) {
        break;
      }
    }
  }
}
