# Terraform use by default my kubebonfig to connect to the k3d cluster.
# Kubernetes provider using local kubeconfig (k3d)
provider "kubernetes" {
    config_path     = var.kubeconfig_path
}

# Helm provider using the same kubeconfig
provider "helm" {
    kubernetes = {
        config_path = var.kubeconfig_path
        config_context = var.kube_context
    }
}