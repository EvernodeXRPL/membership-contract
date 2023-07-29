const fs = require("fs");

const membershipStatus = {
    pending: 'pending', // Membership request submitted but not accepted into unl yet.
    member: 'member',
    revoked: 'revoked' // Membership has been revoked.
};
Object.freeze(membershipStatus);

// This class manages the memberships.
class MembershipRegistry {

    membershipsFile = "memberships.json"; // Keeps the shared cluster membership information.
    memberships = [];
    contractCtx;

    constructor(contractCtx) {
        this.contractCtx = contractCtx;
    }

    async init() {
        // In the begning, there are no memberships on file. Initial memberships need to be added via a
        // a soecial bootstrap user input containing the initial unl.
        if (fs.existsSync(this.membershipsFile)) {
            this.memberships = JSON.parse((await fs.promises.readFile(this.membershipsFile)).toString())
            return true;
        }
        else {
            this.memberships = [];
            return false;
        }
    }

    async enrollForMembership(pubkey, netAddress, peerPort, userPort) {
        const member = this.memberships.find(m => m.pubkey === pubkey);
        if (!member) {
            this.memberships.push({
                pubkey,
                netAddress,
                peerPort,
                userPort,
                status: membershipStatus.pending,
                uriToken: null
            })
            await this.#persist();
        }
        else {
            console.log("enrollForMembership: Member already exists.", pubkey);
        }
    }

    async grantMembership(pubkey, uriToken) {
        const member = this.memberships.find(m => m.pubkey === pubkey);
        if (member) {
            member.status = membershipStatus.member;
            member.uriToken = uriToken;
            await this.#persist();
        }
        else {
            console.log("grantMembership: Member not found.", pubkey);
        }
    }

    async revokeMembership(pubkey) {
        const member = this.memberships.find(m => m.pubkey === pubkey);
        if (member) {
            member.status = membershipStatus.revoked;
            await this.#persist();
        }
        else {
            console.log("revokeMembership: Member not found.", pubkey);
        }
    }

    async purgeMembership(pubkey) {
        const member = this.memberships.find(m => m.pubkey === pubkey);
        if (member) {
            this.memberships = this.memberships.splice(this.memberships.indexOf(member), 1);
            await this.#persist();
        }
        else {
            console.log("purgeMembership: Member not found.", pubkey);
        }
    }

    // This is called during the cluster initalization to make the initial unl.
    // This assumes the XRPL account has already been setup with the multi-sign keys of the initial nodes.
    async bootstrap(members) {

        if (!members || members.length === 0) {
            console.log("Invalid member bootstrap info.");
            return false
        }

        this.memberships = members.map(n => {
            return {
                pubkey: n.pubkey,
                netAddress: n.netAddress,
                peerPort: n.peerPort,
                userPort: n.userPort,
                status: membershipStatus.pending, // All initial members are added as 'pending' since uri tokens are not minted yet.
                uriToken: null
            }
        });
        this.#persist();

        // Set the HotPocket unl to be the public keys of the initial members.
        const hpconfig = await this.hpContext.getContractConfig();
        hpconfig.unl = this.memberships.map(m => m.pubkey);
        await this.hpContext.updateContractConfig(hpconfig);

        // Update the peer list so this node forms connection to all the members.
        const peers = this.memberships.map(m => `${m.netAddress}:${m.peerPort}`);
        await this.contractCtx.updatePeers(peers);
        return true;
    }

    async #persist() {
        await fs.promises.writeFile(this.membershipsFile, JSON.stringify(this.memberships));
    }
}

module.exports = {
    MembershipRegistry,
    membershipStatus
}