variable "kubeconfig_path" {
    type        = string
    default     = "~/.kube/config"
    description = "Path to the kubeconfig file created by k3d (or set KUBECONFIG env)."
}

variable "kube_context" {
    type        = string
    default     = ""
    description = "Optional kube context name. Leave empty to use current-context from kubeconfig."
}