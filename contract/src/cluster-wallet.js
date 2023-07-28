const fs = require("fs");

class ClusterWallet {
    publicXrplFile = "xrplpublic.json"; // Keeps the shared xrpl account information.
    privateXrplFile = "../xrplprivate.json"; // Keeps the xrpl secret information for this node.
    xrpl;

    constructor() {

    }

    async init() {
        // In the begning, there are no xrpl info on file. Initial info need to be added via a
        // a special bootstrap user input containing the xrpl information.
        if (fs.existsSync(this.publicXrplFile) && fs.existsSync(this.privateXrplFile)) {
            this.xrpl = {
                ...JSON.parse((await fs.promises.readFile(this.publicXrplFile)).toString()),
                ...JSON.parse((await fs.promises.readFile(this.privateXrplFile)).toString())
            }
            return true;
        }
        else {
            this.xrpl = null;
            return false;
        }
    }

    async persistAddress(address) {
        if (!address) {
            console.log("Invalid wallet address.");
            return false
        }
        await fs.promises.writeFile(this.publicXrplFile, JSON.stringify({ address }));
    }

    async persistSecret(secret) {
        if (!secret) {
            console.log("Invalid wallet secret.");
            return false
        }
        await fs.promises.writeFile(this.privateXrplFile, JSON.stringify({ address: secret }));
    }
}

module.exports = {
    ClusterWallet
}