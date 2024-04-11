const { ethers } = require("hardhat");
const { createWalletsAndAddresses, ethersDebugMessages } = require('./inc/libGoerli');

(async ()=>{
    const {
        mainDeployKey,
        goerliKey
    } = await createWalletsAndAddresses(ethers.provider);

    console.log("Deploy key: " + mainDeployKey.address);
    console.log("Sepolia key: " + goerliKey.address);

    const mainnetENSRegistry = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e"; //same as on goerli

    const goerliResolver = "0x763fD665d7081404c6BfEC5837A4E90c423eE522";

    const sepoliaResolver = "0x7feaBb1a5597726662F480df407b4E9E81C91e28";
    const sepoliaResolver2 = "0x155454A5d3252D5bEDc6F4C84177c669E420Ca4D";

    //resolver contract

    const prodUrl = "https://ens-gate.main.smartlayer.network/{sender}/{data}.json";
    const testUri = "https://ens-gate.test.smartlayer.network/{sender}/{data}.json";
    const localTestUri = "http://44.217.178.162:8082/{sender}/{data}.json";//44.217.178.162
    const pcTestUri = "http://192.168.50.206:8080/{sender}/{data}.json";

    const spaceCoTest = "http://10.191.8.133:8080/{sender}/{data}.json"; 
    const google = "http://100.112.105.229:8080/{sender}/{data}.json"; 
    const miccyphone = "http://192.168.43.187:8080/{sender}/{data}.json";

    const signerProd = "0x9c4171b69E5659647556E81007EF941f9B042b1a";
    const signerTest = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
    const localSigner = "0xC9A39015CB7c64c743815E55789ab63A321FB249";
    const gatewayPrivate = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

    const smartcatNode = ethers.utils.namehash('smartcat.eth');
    const thesmartcatsNode = ethers.utils.namehash('thesmartcats.eth');
    const xnftNode = ethers.utils.namehash('xnft.eth');

    //const CustomResolver2 = await ethers.getContractFactory("OffchainResolver");
    //let customResolver = await CustomResolver2.attach("0xd70784f0fda5bf0918fee4f894c498e387f912ad");
    console.log("EVENT: ");


    //let addSigner = await customResolver.connect(goerliKey).addSigner(gatewayPrivate);
    //await addSigner.wait();
    

    const Registry = await ethers.getContractFactory('ENSRegistry');
    let registry = await Registry.attach(mainnetENSRegistry);
    let regAddr = String(registry.address);
    console.log(`Addr Registry : ${regAddr}`);

    //deploy resolver
    //const CustomResolver = await ethers.getContractFactory("OffchainResolver");
    //let customResolver = await CustomResolver.connect(goerliKey).deploy(pcTestUri, [localSigner, gatewayPrivate]);
    //await customResolver.deployed();

    const CustomResolver2 = await ethers.getContractFactory("OffchainResolver");
    let customResolver = await CustomResolver2.attach(sepoliaResolver2); 

    console.log(`New Resolver Addr : ${customResolver.address}`);
    let localResolverAddr = customResolver.address;

    console.log(`NAMEHASH: ${xnftNode}`);

    //update URL
    let updateUrl = await customResolver.connect(goerliKey).updateUrl(pcTestUri);
    await updateUrl.wait();

    //set resolver
    //let updateResolverTx = await registry.connect(goerliKey).setResolver(xnftNode, localResolverAddr);
    //await updateResolverTx.wait();

    let newUrl = await customResolver.connect(goerliKey).url();
    console.log("URL: " + newUrl);

    // deploy resolver:
    //const CustomResolver = await ethers.getContractFactory("OffchainResolver");


    //

    //first deploy the custom resolver:
    /*const CustomResolver = await ethers.getContractFactory("OffchainResolver");
    let customResolver = await CustomResolver.connect(mainDeployKey).deploy(localTestUri, [signerTest]);
    await customResolver.deployed();*/

    

    //Do not do this on prod
    //const Registry = await ethers.getContractFactory('ENSRegistry'); 
    //let registry = await Registry.connect(mainDeployKey).deploy();
    //await registry.deployed();

    //hook onto registry

    //await mintableNFTTokens.connect(rinkebyDeployKey).updateBaseURL(newMetadataBase); //must use same key as contract deployment

    

    let ensOwner = await registry.connect(goerliKey).owner(smartcatNode);
    console.log("Owner: " + ensOwner);

    let resolverAddr = await registry.connect(goerliKey).resolver(smartcatNode);
    console.log("Resolver: " + resolverAddr);

    const owner = mainDeployKey.address;

    //set resolver
    //await registry.connect(goerliKey).setResolver();

    console.log(`SmartCat Node: ${ethers.utils.namehash('smartcat.eth')}`  );
    console.log(`TheSmartCats Node: ${ethers.utils.namehash('thesmartcats.eth')}`  );

    ensOwner = await registry.connect(goerliKey).owner(thesmartcatsNode);
    console.log("Owner: " + ensOwner);

    resolverAddr = await registry.connect(goerliKey).resolver(thesmartcatsNode);
    console.log("Resolver: " + resolverAddr);

    //set resolver
    //let updateResolverTx = await registry.connect(goerliKey).setResolver(smartcatNode, localResolverAddr);
    //await updateResolverTx.wait();

    resolverAddr = await registry.connect(goerliKey).resolver(smartcatNode);
    console.log("Resolver: " + resolverAddr);

})();
// npx hardhat run scripts/deploy-goerli.js --network goerli