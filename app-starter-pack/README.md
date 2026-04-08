
## Getting Started

### Prerequisites

- Python >=3.10,<3.13
- Google Cloud SDK installed and configured
- [Poetry](https://python-poetry.org/docs/#installation) for dependency management
- A development environment (e.g. your local IDE or, when running remotely on Google Cloud, [Cloud Shell](https://cloud.google.com/shell) or [Cloud Workstations](https://cloud.google.com/workstations)).

Useful commnands:
```bash
python --version
gcloud --version
poetry --version
```


### Download the repo

```bash
git clone https://github.com/googlemaps-samples/react-next25-demo.git
cd react-next25-demo/app-starter-pack
```

### Installation

Install required packages using npm and Poetry:

frontend install:
```bash
npm --prefix frontend install
```

backend install:
```bash
poetry install
```
if poetry hangs you can see verbose logging with 
```bash
poetry install -vvv
```
I have encountered a keyring problem that is fixed with

```bash
poetry config keyring.enabled false
poetry install
```

### Setup

Set your default Google Cloud project and region:

```bash
export PROJECT_ID="kwn-one-goog"
gcloud config set project $PROJECT_ID
gcloud auth application-default login
gcloud auth application-default set-quota-project $PROJECT_ID

export GOOGLE_API_KEY="AIz..."
export REGION="us-central1"
export SERVICE_NAME="kwn-next25-demo"
export PROJECT_NUMBER="775425552391"
export FIRESTORE_PROJECT="itinerary-planner-0001"
export FIRESTORE_CLIENT_EMAIL="firebase-adminsdk-fbsvc@itinerary-planner-0001.iam.gserviceaccount.com"
export FIRESTORE_PRIVATE_KEY="-----BEGIN PRIVATE KEY..."

```

### Other useful things
To get the latest code from the original repo try:

```bash
mkdir <some_working_directory>
cd <some_working_directory>
git clone --no-checkout https://github.com/GoogleCloudPlatform/generative-ai.git
cd generative-ai/
git sparse-checkout init
echo "gemini/sample-apps/e2e-gen-ai-app-starter-pack" > .git/info/sparse-checkout
git checkout
cd gemini/sample-apps/e2e-gen-ai-app-starter-pack/
python app/patterns/multimodal_live_agent/utils/prepare_pattern.py
```

You should now have the latest code and it should organized in the same way the
repo is. 

## Deployment

### Local deployment for development

#### test
```bash
poetry run pytest tests/unit && poetry run pytest tests/integration
```

#### backend
```bash
GOOGLE_API_KEY=$GOOGLE_API_KEY PROJECT_NUMBER=$PROJECT_NUMBER poetry run uvicorn app.server:app --host 0.0.0.0 --port 8000 --reload
```

#### frontend
```bash
npm --prefix frontend start
```

#### backend and frontend together
```bash
echo VITE_GOOGLE_MAPS_API_KEY=$GOOGLE_API_KEY > ./frontend/.env

npm --prefix frontend run build; \
GOOGLE_API_KEY=$GOOGLE_API_KEY \
PROJECT_NUMBER=$PROJECT_NUMBER \
FIRESTORE_PROJECT=$FIRESTORE_PROJECT \
FIRESTORE_CLIENT_EMAIL=$FIRESTORE_CLIENT_EMAIL \
FIRESTORE_PRIVATE_KEY=$FIRESTORE_PRIVATE_KEY \
poetry run uvicorn app.server:app --host 0.0.0.0 --port 8000 --reload
```


### Remote deployment in Cloud Run for development

You can quickly test the application in [Cloud Run](https://cloud.google.com/run). Ensure your service account has the `roles/aiplatform.user` role to access Gemini.

1. **Deploy:**

Note: exectue this from the root of the repo, where there is a lone docker file 
README.md. as an FYI there are two Dockerfiles one for this development deploy
and one used by the GitHub trigger. One day we can probably consolidate them. 

   ```bash
   export REGION="us-central1"
   export SERVICE_NAME="kwn-next25-demo" # some service name specific to you
   export FIRESTORE_PROJECT="itinerary-planner-0001"

   gcloud run deploy $SERVICE_NAME \
     --source . \
     --project $PROJECT_ID \
     --region $REGION \
     --memory "4Gi" \
     --timeout=1200 \
     --set-env-vars "GOOGLE_API_KEY=$GOOGLE_API_KEY" \
     --set-env-vars "PROJECT_NUMBER=$PROJECT_NUMBER" \
     --set-env-vars "FIRESTORE_PROJECT=$FIRESTORE_PROJECT" \
     --set-env-vars "FIRESTORE_CLIENT_EMAIL=$FIRESTORE_CLIENT_EMAIL" \
     --set-env-vars "FIRESTORE_PRIVATE_KEY=$FIRESTORE_PRIVATE_KEY"
   ```

If you don't need to to build from source and just want to deploy an image with
environment variables:
```bash
gcloud run deploy $SERVICE_NAME \
     --image $REGION-docker.pkg.dev/$PROJECT_ID/cloud-run-source-deploy/$SERVICE_NAME:latest \
     --project $PROJECT_ID \
     --region $REGION \
     --memory "4Gi" \
     --timeout=1200 \
     --set-env-vars "GOOGLE_API_KEY=$GOOGLE_API_KEY" \
     --set-env-vars "PROJECT_NUMBER=$PROJECT_NUMBER" \
     --set-env-vars "FIRESTORE_PROJECT=$FIRESTORE_PROJECT" \
     --set-env-vars "FIRESTORE_CLIENT_EMAIL=$FIRESTORE_CLIENT_EMAIL" \
     --set-env-vars "FIRESTORE_PRIVATE_KEY=$FIRESTORE_PRIVATE_KEY"
```

2. **Access:** Use [Cloud Run proxy](https://cloud.google.com/sdk/gcloud/reference/run/services/proxy) for local access. The backend will be accessible at `http://localhost:8000`:

   ```bash
   gcloud run services proxy $SERVICE_NAME --port 8000 --project $PROJECT_ID --region $REGION
   ```

   You can then use the same frontend setup described above to interact with your Cloud Run deployment.


The repository includes a Terraform configuration for the setup of the Dev Google Cloud project.
See [deployment/README.md](deployment/README.md) for instructions.

### Production Deployment with Terraform

![Deployment Workflow](https://storage.googleapis.com/github-repo/generative-ai/sample-apps/e2e-gen-ai-app-starter-pack/deployment_workflow.png)

**Quick Start:**

1. Enable required APIs in the CI/CD project.

   ```bash
   gcloud config set project YOUR_CI_CD_PROJECT_ID
   gcloud services enable serviceusage.googleapis.com cloudresourcemanager.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com
   ```

2. Create a Git repository (GitHub, GitLab, Bitbucket).
3. Connect to Cloud Build following [Cloud Build Repository Setup](https://cloud.google.com/build/docs/repositories#whats_next).
4. Configure [`deployment/terraform/vars/env.tfvars`](deployment/terraform/vars/env.tfvars) with your project details.
5. Deploy infrastructure:

   ```bash
   cd deployment/terraform
   terraform init
   terraform apply --var-file vars/env.tfvars
   ```

6. Perform a commit and push to the repository to see the CI/CD pipelines in action!

For detailed deployment instructions, refer to [deployment/README.md](deployment/README.md).

### Accessing the appliction through the proxy
```bash
   gcloud run services proxy react-next25-demo --port 8000 --project $PROJECT_ID --region us-central1
   ```

## Contributing

Contributions are welcome! See the [Contributing Guide](CONTRIBUTING.md).

## Feedback

We value your input! Your feedback helps us improve this starter pack and make it more useful for the community.

### Getting Help

If you encounter any issues or have specific suggestions, please first consider [raising an issue](https://github.com/GoogleCloudPlatform/generative-ai/issues) on our GitHub repository.

### Share Your Experience

For other types of feedback, or if you'd like to share a positive experience or success story using this starter pack, we'd love to hear from you! You can reach out to us at <a href="mailto:e2e-gen-ai-app-starter-pack@google.com">e2e-gen-ai-app-starter-pack@google.com</a>.

Thank you for your contributions!

## Disclaimer

This repository is for demonstrative purposes only and is not an officially supported Google product.
