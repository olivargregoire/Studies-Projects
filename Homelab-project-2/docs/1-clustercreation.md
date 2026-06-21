Step 1 – Kubernetes Cluster Setup and Terraform Connection

The first step of the project is to set up a local Kubernetes cluster and make sure it is working correctly. The cluster is created manually using k3d. After its creation, basic checks are done to verify that the cluster is healthy, such as confirming that both nodes are in a Ready state and that the system pods are running properly.

To create it:

k3d cluster create devops-platform \
  --agents 1 \
  --servers 1 \
  --k3s-arg "--disable=traefik@server:0"

This command creates a local Kubernetes cluster with:
    - 1 control plane node
    - 1 worker nodes (will see if I need more later)
    - no default Traefik ingress
The cluster is optimized for learning, experimentation, and platform setup, while staying close to real-world Kubernetes practices.

To start the cluster: 
 
k3d cluster start devops-platform

To stop the cluster : 

k3d cluster stop devops-platform


Maybe we could have provisioned the cluster also via Terraform but I don't think it was possible, as basically Terraform is just contacting the k3s API ton create its ressources. (Nobody to contact if no cluster already)
k3
<Screen of the cluster pods - namespaces - could be great to explain the pods and why I see them>

Once the cluster is validated, Terraform is configured to connect to the Kubernetes cluster using the local kubeconfig. Terraform is then used to create the required namespaces for the project. After applying the Terraform configuration, the namespaces appear correctly in the cluster, which confirms that Terraform is working as expected and can manage Kubernetes resources.