# Tenant feature requirements

These are the features required by by instance owners (Evernode tenants) to spawn and maintain their membership instance. We could come up with scripts/tools to achieve these features.

### Bootstrapping a cluster

1. Setting up a new multi-sign XRPL account (cluster wallet).
1. Spawning the initial set of nodes.
1. Bootstrap the nodes
1. Bootstrap the memberships

### Membership activities

1. Spawning new instances to join as new members.
1. Submit the membership request after the new instance is ready.
1. Check the status of a membership instance.
1. Automate lease extension of a membership instance.

## Bootstrapping a cluster

Setting up a contract cluster has to be done carefully so that the nodes and their credentials are setup in isolation and then finally they could be linked together to form the initial UNL capable of controlling the cluster wallet.

First, we need to decide how many nodes are going to form the initial UNL cluster. Let's call it N nodes. Let's make it so that all N nodes will be signers of the cluster wallet. This process can be performed in a decentralized manner with N independant parties coordinating among each other.

### 1. Setting up a new multi-sign XRPL account (cluster wallet)

1. We first require that N parties to independetly generate N xrpl secrets and corresponding addresses. From here onwards the tenant tool should be able to perform the following.
1. Setup an XRPL account with the N signer addresses collected earlier (this can be done by anyone).

### 2. Spawning the initial set of nodes

1. Agree upon the UUIDv4 contract id for the cluster.
1. Each party independently create their own new contract instance in Evernode using the agreed upon contrac id.
1. Record the created instance information for use in upcoming steps.

### 3. Bootstrap the nodes

In this stage, we need to get all nodes synchornized with each other while also containing node-specific private wallet secret in them too. The "node_bootstrap" input stores the node-specific secret information in a private area that is not shared with other nodes. In order to get everything else equal among all nodes, we chose Node 1 as the "origin" so all other nodes become a clone of Node 1.

1. Each party uploads the compiled membership contract bundle to the new instance.
   - The bundle contract config should have the authorized user ed55219 public key hex as a arg in bin_args.
   - Only the authorized user will be able to submit the private wallet secret information to the node.
1. First, **Node 1** submits the following as a HotPocket user input through its authorized user private key:
   ```
   {
       type: "origin_bootstrap",
       cluster: {
           walletAddress: "",     // Cluster wallet address
       },
       node: {
           walletSecret: ""       // This node's signing secret
       }
   }
   ```
1. The submission should send back an output with a success result.
1. Then, the rest of the nodes submit following bootstrap information to themselves using their own authorized user private key.
   ```
   {
       type: "node_bootstrap",
       node: {
           walletSecret: ""       // This node's signing secret
       }
       origin: {
           pubkey: "public key of node 1",
           netAddress: "network address of node 1",
           peerPort: "peer port of node 1"
       }
   }
   ```
1. The submissions should send back an output with a success result.
1. After this, all nodes would sync with Node 1 and become clones. The UNL of all nodes is Node 1. Hence, all contract state and configuration from Node 1 is now cloned into all other nodes.
1. DO NOT submit this input again as it would make the node's private secret available for access to Node 1.

### 4. Bootstrap the memberships

Now we have N signer nodes but only 1 UNL node among them. We need to expand the UNL to include all nodes while also populating the membership registry.

1. Any one party holding the authorized user private key of Node 1 can perform this step.
1. Submit the following as a HotPocket user input using Node 1 user private key. The input can be submitted to any node.

   ```
   {
       type: "membership_bootstrap",
       memberships: [{      // Array containing information about all nodes in the initial cluster
           pubkey: "",
           netAddress: "",
           peerPort: 1111,
           userPort: 2222,
       }, {
           pubkey: "",
           netAddress: "",
           peerPort: 3333,
           userPort: 4444,
       },...]
   }
   ```

1. Once this input is processed, the Node 1 will update its membership registry and the UNL to include all nodes. Since all other nodes are mimicking the Node 1 they will also do the same.
1. From this point onwards all nodes have equal voting power in the UNL and now the cluster is in normal operation.
