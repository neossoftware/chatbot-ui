# How to deploy an EKS cluster with Terraform

I don't have a dedicated deployment guide in the current context. Based on common private-cluster requirements, this is how to structure the Terraform code.

## Core requirements

- Private API endpoint only, no public access
- Private routable subnets (`10.x.x.x` range)
- Access entries instead of the `aws-auth` ConfigMap
- Every resource tagged with owner and cost centre

## 1. EKS cluster configuration

```hcl
resource "aws_eks_cluster" "main" {
  name     = var.cluster_name
  role_arn = aws_iam_role.eks_cluster.arn
  version  = var.kubernetes_version

  vpc_config {
    # Private API access only
    endpoint_private_access = true
    endpoint_public_access  = false

    subnet_ids = var.private_subnet_ids
  }

  tags = {
    Name = var.cluster_name
  }
}
```

## 2. EKS access entries

Use access entries instead of editing `aws-auth` by hand:

```hcl
resource "aws_eks_access_entry" "codebuild_role" {
  cluster_name      = aws_eks_cluster.main.name
  principal_arn     = aws_iam_role.codebuild.arn
  kubernetes_groups = ["system:masters"] # or more restrictive groups
  type              = "STANDARD"
}
```

> **Tip:** start with a narrow group and widen it only when a pipeline step fails. `system:masters` should not be the default.

## 3. Internal NLB for `kubectl` access

The API server is private, so pipelines reach it through an internal Network Load Balancer:

1. Look up the cluster API server network interfaces.
2. Register their IPs as targets of an internal NLB.
3. Point the pipeline `kubeconfig` at the NLB DNS name.

```hcl
data "aws_network_interfaces" "eks_api_server" {
  filter {
    name   = "description"
    values = ["Amazon EKS ${aws_eks_cluster.main.name}"]
  }
}
```

## Deployment checklist

| Step | Owner | Tool |
|---|---|---|
| VPC and private subnets | Platform team | Terraform |
| EKS cluster and node groups | Application team | Terraform |
| Access entries | Security team | Terraform |
| Workload deploy | Application team | `kubectl` via NLB |

Run `terraform plan` in a pipeline first and keep the state in an encrypted S3 backend with locking.
