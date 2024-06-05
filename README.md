# Universal NFT name resolver service. 

Forked from [ENS Offchain Resolver](https://github.com/ensdomains/offchain-resolver)

- Use your own ENS name or a subdomain of one of ours for your NFT collection.
- Each NFT can create a subdomain name which links to the NFT's TBA [EIP-6551] wallet.
- Gas free - creating NFT subdomain is gas free. There is a one-time gas cost for collection owner if you bring-your-own domain.
- Collection owners - you still own the base ENS and the existing direct ENS address is unaffected.

See an example here: `garfield.thesmartcats.eth`. This will resolve to 

This repository contains smart contracts and a node.js gateway server that together deply a generic service that is focussed on providing offchain ENS names for NFT token collections, that usually resolve to the token's TBA [EIP 6551](https://eips.ethereum.org/EIPS/eip-6551). Offchain ENS is provided by [EIP 3668](https://eips.ethereum.org/EIPS/eip-3668) and [ENSIP 10](https://docs.ens.domains/ens-improvement-proposals/ensip-10-wildcard-resolution).

## Overview

ENS resolution requests to the resolver implemented in this repository are responded to with a directive to query a gateway server for the answer. The gateway server generates and signs a response, which is sent back to the original resolver for decoding and verification. Full details of this request flow can be found in EIP 3668.

All of this happens transparently in supported clients (such as ethers.js with the ethers-ccip-read-provider plugin, or future versions of ethers.js which will have this functionality built-in).

## Server API

The server API allows Token Contract owners to register their NFT contract into this service. Registration links a basename to a token contract.

For example: NFT contract "CryptoShrews" registers a basename cryptoshrews.eth. Each NFT would then register a name that uses this basename: joe.cryptoshrews.eth, max.cryptoshrews.eth, etc.

This can take the form of "bringing your own ENS" which does require a single gas payment to set the resolver (see below) or simply use a subdomain of one of our provided ENS names, eg "catcollection.smartlayer.eth" - each token would have a subdomain name like "joe.catcollection.smartlayer.eth", "max.catcollection.smartlayer.eth", etc.

### Register a token/domain

The easiest way to begin is to register a domain for you token contract.

Here is a list of curently available domains which you can derive a subdomain from:

#### Mainnet: 
- smartlayer.eth (More to come!)

#### Sepolia & Holesky:
- smartlayer.eth
- thesmartcats.eth
- xnft.eth
- esp32.eth
- cryptopunks.eth
- 61cygni.eth

## Registering a domain for a token contract using the preset domains

To register a domain using a derivative of the above, you need to use the wallet that is the 'owner()' of the token contract. If there is no owner, then you can use any account to register the domain.

```POST``` ```https://ens.main.smartlayer.com/registertoken/{token chainId}/{token contract}/{proposed domain name}/{signature}/{optional ensChainId}```

If you are registering on mainnet, you can select a different chain for the token, if you register on Holesky or Sepolia, you can only choose a token on that chain.

Eg you have an NFT contract on Polygon you want to register on mainnet:

```https://ens.main.smartlayer.com/registertoken/137/0x<CONTRACT ADDRESS>/wowsignals.smartlayer.eth/0x123456...1c/1```

The signature is a "sign personal" of the following message:

```Attempting to register domain {proposed domain name} name to {token contract} on chain {token chainId}```

in this case:

```Attempting to register domain wowsignals.smartlayer.eth name to 0x<CONTRACT ADDRESS> on chain 137```

## Registering a domain for a token contract using "Bring Your Own ENS"

First register your domain name. Let's use Holesky for this example. Open the ENS app:

https://app.ens.domains

and connect your wallet on Holesky - ensuring you have some Holesky ETH in your wallet.

obtain a name that hasn't been taken.

Once fully registered you will see the record page. Click on the "More" tab:

Now on the "Resolver" section click on the "Edit" button, and paste the universal resolver contract for the chain you are registering on:

Mainnet: 0x70E27fE870a96162b6Ae23CBdB8D76F9F382A809
Sepolia: 0x155454A5d3252D5bEDc6F4C84177c669E420Ca4D
HoleSky: 0x2b65f09d672adBEF4F22Cd16d018e157cb778051

This contract links the ENS name to this Universal NFT resolver service.

Then, simply follow the same directions as above, but your ```{proposed domain name}``` will be shorter - just the name you just registered eg ```jules.eth```.

### Indiviual NFT registration

Then, for each NFT owner they will need to register the token individually like this:

```/register/{chainId}/{name}/{tokenId}/{signature}```

Where the signature is a "sign personal" of the following message:

```Registering your tokenId ${tokenId} name to ${name} on chain ${chainId}```

Eg for the first NFT on the contract, choosing the name "twentyone":

```Registering your tokenId 1 name to twentyone.smartlayer.eth on chain 137```

```https://ens.main.smartlayer.com/register/137/twentyone.smartlayer.eth/0x<CONTRACT ADDRESS>/1/0x123456...1c```

This will register the NFT on the mainnet, and return a response like this:

```{"result":"pass"}```

Eg for the first NFT on the contract:

```https://ens.main.smartlayer.com/register/137/0x<CONTRACT ADDRESS>/1/0x123456...1c```

This will register the NFT on the mainnet, and return a response like this:

```{"result":"pass"}```

or an error message if there was a failure - eg if the domain is taken or if the signature is invalid, the the applyer doesn't own the token.

The address that will be returned from the ENS call will be the TBA [EIP-6551] wallet address for the token.


### Alternative registration for single NFTs

This can be used where the collection owner hasn't registered a domain.

```/registerNFT/{chainId}/{tokenAddress}/{name}/{tokenId}/{signature}/{optional ensChainId}```

Where the signature is a "sign personal" of the following message:

```Attempting to register NFT ${name} name to ${tokenContract} ${tokenId} on chain ${chainId}```

Eg for the fifteenth NFT on the contract on Holesky (17000), choosing the name "minsc.xnft.eth":

```https://ens.main.smartlayer.com/registerNFT/17000/0x<CONTRACT ADDRESS>/minsc.xnft.eth/15/0x123456...1c```

where the signature is a "sign personal" of the following message:

```Attempting to register NFT minsc.xnft.eth name to 0x<CONTRACT ADDRESS> 15 on chain 17000```

This will register the NFT on the mainnet, and return a response like this:

```{"result":"pass"}```

if successful.

## [Gateway Server](packages/gateway)

The gateway server implements CCIP Read (EIP 3668), and answers requests by looking up the names in a backing store. By default this is a JSON file, but the backend is pluggable and alternate backends can be provided by implementing a simple interface. Once a record is retrieved, it is signed using a user-provided key to assert its validity, and both record and signature are returned to the caller so they can be provided to the contract that initiated the request.

## [Contracts](packages/contracts)

The smart contract provides a resolver stub that implement CCIP Read (EIP 3668) and ENS wildcard resolution (ENSIP 10). When queried for a name, it directs the client to query the gateway server. When called back with the gateway server response, the resolver verifies the signature was produced by an authorised signer, and returns the response to the client.

## Trying it out

Start by generating an Ethereum private key; this will be used as a signing key for any messages signed by your gateway service. You can use a variety of tools for this; for instance, this Python snippet will generate one for you:

```
python3 -c "import os; import binascii; print('0x%s' % binascii.hexlify(os.urandom(32)).decode('utf-8'))"
```

For the rest of this demo we will be using the standard test private key `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`.

First, install dependencies and build all packages:

```bash
yarn && yarn build
```

[Follow here](#running-locally) to run gateway worker locally. ( Skip this step if cloudflare worker url will be used as a remote gateway )
<br/><br/>

Take a look at the data in `test.eth.json` under `packages/gateway/`; it specifies addresses for the name `test.eth` and the wildcard `*.test.eth`.

Next, edit `packages/contracts/hardhat.config.js`; replacing the address on `line 64` with the one output when you ran the command above. 

Then, in a new terminal, build and run a test node with an ENS registry and the offchain resolver deployed:

```bash
# If local cloudflare worker will be used
yarn start:node
# If remote cloudflare worker url will be used as gateway use the script below instead
export REMOTE_GATEWAY=https://offchain-gateway.ensdomains.workers.dev
yarn start:node
```

You will see output similar to the following:

```
Compilation finished successfully
deploying "ENSRegistry" (tx: 0x8b353610592763c0abd8b06305e9e82c1b14afeecac99b1ce1ee54f5271baa2c)...: deployed at 0x5FbDB2315678afecb367f032d93F642f64180aa3 with 1084532 gas
deploying "OffchainResolver" (tx: 0xdb3142c2c4d214b58378a5261859a7f104908a38b4b9911bb75f8f21aa28e896)...: deployed at 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512 with 1533637 gas
Started HTTP and WebSocket JSON-RPC server at http://127.0.0.1:9545/

Accounts
========

WARNING: These accounts, and their private keys, are publicly known.
Any funds sent to them on Mainnet or any other live network WILL BE LOST.

Account #0: 0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266 (10000 ETH)
Private Key: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

(truncated for brevity)
```

Take note of the address to which the ENSRegistry was deployed (0x5FbDB...).

Finally, in a third terminal, run the example client to demonstrate resolving a name:

```
yarn start:client --registry 0x5FbDB2315678afecb367f032d93F642f64180aa3 test.eth
yarn start:client --registry 0x5FbDB2315678afecb367f032d93F642f64180aa3 foo.test.eth
```

You should see output similar to the following:

```
$ yarn start:client --registry 0x5FbDB2315678afecb367f032d93F642f64180aa3 test.eth
yarn run v1.22.17
$ node packages/client/dist/index.js --registry 0x5FbDB2315678afecb367f032d93F642f64180aa3 test.eth
resolver address 0x8464135c8F25Da09e49BC8782676a84730C318bC
eth address 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
content null
email test@example.com
Done in 0.28s.

$ yarn start:client --registry 0x5FbDB2315678afecb367f032d93F642f64180aa3 foo.test.eth
yarn run v1.22.17
$ node packages/client/dist/index.js --registry 0x5FbDB2315678afecb367f032d93F642f64180aa3 foo.test.eth
resolver address 0x8464135c8F25Da09e49BC8782676a84730C318bC
eth address 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
content null
email wildcard@example.com
Done in 0.23s.
```

Check these addresses against the gateway's `test.eth.json` and you will see that they match.

## Real-world usage

There are 5 main steps to using this in production:

 1. Optionally, write a new backend for the gateway that queries your own data store. Or, use the JSON one and write your records to a JSON file in the format described in the gateway repository.
 2. Generate one or more signing keys. Secure these appropriately; posession of the signing keys makes it possible to forge name resolution responses!
 3. Start up a gateway server using your name database and a signing key. Publish it on a publicly-accessible URL.
 4. Deploy `OffchainResolver` to Ethereum, providing it with the gateway URL and list of signing key addresses.
 5. Set the newly deployed resolver as the resolver for one or more ENS names.

## Cloudflare Worker development

### Running locally

1. Create a `dev.vars` file under `packages/gateway/` folder
2. Put gateway private key into it in between double quotes, as below;
```
OG_PRIVATE_KEY="PRIVATE_KEY_HERE"
```
3. Run worker with `wrangler dev --local` command

### Deployment

1. Register private key as a worker [secret](https://developers.cloudflare.com/workers/platform/environment-variables/#adding-secrets-via-wrangler).
```bash
# wrangler secret put <key> <value>
wrangler secret put OG_PRIVATE_KEY PRIVATE_KEY_HERE
```
2. Build the gateway via `yarn build`
3. Deploy the worker with `wrangler publish`
