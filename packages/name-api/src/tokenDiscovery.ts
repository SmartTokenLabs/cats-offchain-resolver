
export const tokenDataRequest = async (chainId: number, tokenContract: string, tokenId: Number) => {
  try {
    const tokenReq = await fetch(`https://resources.smarttokenlabs.com/${chainId}/${tokenContract}/${tokenId}`);
    return tokenReq.json();
  } catch (error) {
    console.log("error: ", error);
    return null;
  }
}