const fs = require("fs");
const evp = require('everpocket-nodejs-contract');
const { membershipStatus } = require("./membership-registry");

const operationType = {
    tokenMint: 'token_mint',
    tokenBurn: 'token_burn',
};
Object.freeze(operationType);

const operationStatus = {
    pending: 'pending',
    started: 'started'  // Only one wallet operation can be started at a time.
};
Object.freeze(operationStatus);

class ClusterWallet {
    publicXrplFile = "xrplpublic.json"; // Keeps the shared xrpl account information.
    operationsFile = "wallet-operations.json";
    walletAddress;
    operations = [];
    registry;
    xrplContext;

    async bootstrap(walletAddress) {

        // During bootstrap we generate a xrpl key pair private to this node. We store the secret in private storage and return the account address
        // back so that address can be added to the cluster wallet account as a signer.
        const msigner = new evp.MultiSigner(walletAddress);
        const signerKey = msigner.generateSigner();
        await fs.promises.writeFile(`../${walletAddress}.key`, JSON.stringify(signerKey));

        await this.#persistAddress(walletAddress);
        await this.#persistOperations();

        console.log("Signer info bootstrapped");

        // Return generated multi-sign address.
        return signerKey.account;
    }

    async init(registry, hotPocketContext) {
        this.registry = registry;

        const data = await Promise.all([
            fs.promises.readFile(this.publicXrplFile),
            fs.promises.readFile(this.operationsFile)
        ]);

        // The everpocket xrplContext maintains this node's signing key and manages multi sign operations with rest of the cluster.
        this.walletAddress = JSON.parse(data[0].toString()).address;
        this.xrplContext = new evp.XrplContext(hotPocketContext, this.walletAddress);
        await this.xrplContext.init();

        this.operations = JSON.parse(data[1].toString());

        // Check whether any more wallet operations are needed to fullfil missing information in the membership registry.

        const newMemberships = this.registry.memberships.filter(m => m.status === membershipStatus.pending && !m.uriToken);
        const newMintOps = newMemberships.filter(m => !this.operations.find(op => op.pubkey === m.pubkey && op.type === operationType.tokenMint));
        this.operations.push(...newMintOps.map(m => {
            return {
                type: operationType.tokenMint,
                pubkey: m.pubkey,
                status: operationStatus.pending
            }
        }));

        const revokedMemberships = this.registry.memberships.filter(m => m.status === membershipStatus.revoked && m.uriToken);
        const newBurnOps = revokedMemberships.filter(m => !this.operations.find(op => op.pubkey === m.pubkey && op.type === operationType.tokenBurn));
        this.operations.push(...newBurnOps.map(m => {
            return {
                type: operationType.tokenBurn,
                pubkey: m.pubkey,
                status: operationStatus.pending
            }
        }));

        await this.#persistOperations();

        await this.processOperations();
    }

    async deinit() {
        await this.xrplContext.deinit();
    }

    async rotateSigners() {
        if (this.operations.length > 0) {
            console.log("Signer rotation abandoned due to pending transactions.");
            return;
        }

        // TODO: Use xrplContext to elect a new set of signers.
    }

    async #persistAddress(address) {
        if (!address) {
            console.log("Invalid wallet address.");
            return false
        }
        await fs.promises.writeFile(this.publicXrplFile, JSON.stringify({ address }, null, 2));
    }

    async #persistOperations() {
        await fs.promises.writeFile(this.operationsFile, JSON.stringify(this.operations, null, 2));
    }

    // Submit any pending operations and check for completions of started operations.
    async processOperations() {

        // We only process one operation at a time until its completion.
        // If there is no started operation we pick the first pending operation in the list.
        let operation = this.operations.find(op => op.status === operationStatus.started);
        if (!operation) {
            operation = this.operations.find(op => op.status === operationStatus.pending);
        }

        if (operation) {
            if (operation.status === operationStatus.pending) {

                if (operation.type === operationType.tokenMint) {
                    const node = this.registry.memberships.find(m => m.pubkey === operation.pubkey);
                    const uri = `${node.pubkey};${node.netAddress};${node.peerPort};${node.userPort}`;

                    console.log("Token mint preperation.", uri);
                    const prepTxn = await this.xrplContext.xrplAcc.prepareMintURIToken(uri);
                    const txn = await this.xrplContext.multiSignAndSubmitTransaction(prepTxn);
                    operation.status = operationStatus.started;
                    operation.txnHash = txn.hash;
                    operation.tokenUri = uri;
                    console.log("Token mint txn submitted.", uri);
                }
                else if (operation.type === operationType.tokenBurn) {
                    const node = this.registry.memberships.find(m => m.pubkey === operation.pubkey);

                    console.log("Token burn preperation.", node.uriToken);
                    const txn = await this.xrplContext.xrplAcc.prepareBurnURIToken(node.uriToken);
                    await this.xrplContext.multiSignAndSubmitTransaction(txn);
                    operation.status = operationStatus.started;
                    operation.txnHash = txn.hash;
                    console.log("Token burn txn submitted.", node.uriToken);
                }
            }
            else if (operation.status === operationStatus.started && operation.txnHash) {

                // TODO: If for some reason the transaction fails, we'll never get to know about it from EverPocket xrplContext.
                // This would cause our operations to halt since the 'started' operation will never become completed or abandoned.
                // We need visibility of failed txns from xrplContext or we need to implement a timeout mechanism for started subscriptions
                // in our membership contract.

                if (await this.xrplContext.getValidatedTransaction(operation.txnHash)) {

                    if (operation.type === operationType.tokenMint) {
                        const token = await this.xrplContext.xrplAcc.getURITokenByUri(operation.tokenUri);
                        token && await this.registry.grantMembership(operation.pubkey, token.index);
                    }
                    else if (operation.type === operationType.tokenBurn) {
                        await this.registry.purgeMembership(operation.pubkey);
                    }

                    // Remove the completed operation from the list.
                    this.operations.splice(this.operations.indexOf(operation), 1);
                }
            }

            await this.#persistOperations();
        }
    }
}

module.exports = {
    ClusterWallet
}