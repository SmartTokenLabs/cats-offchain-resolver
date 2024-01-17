
export const tokenDataRequest = async (chainId: number, tokenContract: string, tokenId: Number) => {
  try {
    var queryUrl = `https://resources.smarttokenlabs.com/${chainId}/${tokenContract}/${tokenId}`; // standard STL metadata resolver
    if (tokenContract == "0x2483e332d97c9daea4508c1c4f5bee4a90469229" && chainId == 5) {
      queryUrl = `https://ipfs.io/ipfs/Qmcob1MaPTXUZt5MztHEgsYhrf7R6G7wV8hpcweL8nEfgU/meka/${tokenId}`; //for testnet case
    }

    const tokenReq = await fetch(queryUrl);
    const tokenJSON = await tokenReq.json();
    console.log("JSON: " + tokenJSON);
    console.log("TJ " + tokenJSON.image);

    //const jsonObj = tokenJSON ? JSON.parse(tokenJSON) : null;

    // @ts-ignore
    return tokenJSON.image;
  } catch (error) {
    console.log("error: ", error);
    return null;
  }
}

export const tokenContractSelection = async (chainId: number, name: string) => {
  try {

    var contractAddr = "";
    const selectName = name + "-" + chainId;

    switch (selectName) {
      case 'smartcat.eth-5':
        contractAddr = "0x2483e332d97c9daea4508c1c4f5bee4a90469229";
        break;
      case 'thesmartcats.eth-5':
        contractAddr = "0x2483e332d97c9daea4508c1c4f5bee4a90469229";
        break;
      case 'thesmartcats.eth-137':
        contractAddr = "0xd5ca946ac1c1f24eb26dae9e1a53ba6a02bd97fe";
        break;
    }

    return contractAddr;
    
  } catch (error) {
    console.log("error: ", error);
    return null;
  }
}