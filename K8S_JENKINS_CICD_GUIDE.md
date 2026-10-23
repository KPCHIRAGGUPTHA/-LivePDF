# Jenkins – Docker – Kubernetes (CI/CD Pipeline Guide)

This guide follows the tutorial **"Jenkin – Docker – Kubernetes (CI-CD Demo)"** step-by-step, fully configured for your repository (`https://github.com/KPCHIRAGGUPTHA/-LivePDF`) and your Docker Hub account (`kpchiragguptha`).

---

## Architecture Overview

```
                      CI (Continuous Integration)
+----------------+      +-------------------+      +--------------------+      +--------------------+
|  Git Push to   | ---> |  Jenkins Triggers | ---> |  Maven Compiles    | ---> |  Docker Builds     |
|     GitHub     |      |   Pipeline Job    |      |  & Packages JAR    |      |    & Tags Image    |
+----------------+      +-------------------+      +--------------------+      +--------------------+
                                                                                       |
                                                                                       v
                      CD (Continuous Deployment)                               +--------------------+
+----------------+      +-------------------+      +--------------------+      |   Push Image to    |
| Service Exposed| <--- | Kubernetes Pulls  | <--- |  Jenkins Applies   | <--- |     Docker Hub     |
| NodePort 30008 |      |  Image & Deploys  |      |  deployment.yaml   |      +--------------------+
+----------------+      +-------------------+      +--------------------+
```

---

## Step 1: Install & Start Docker Desktop
1. Ensure **Docker Desktop** is installed on your Windows machine.
2. Launch Docker Desktop from the Start Menu.
3. Wait until the status indicator in the bottom-left shows **Docker Engine is running**.

---

## Step 2: Enable Kubernetes in Docker Desktop
1. Open the Docker Desktop Dashboard.
2. Click the **Gear icon (Settings)** in the top-right toolbar.
3. In the left-hand navigation menu, select the **Kubernetes** tab.
4. Check the box labeled **Enable Kubernetes**.
5. Click **Apply & Restart** at the bottom right.
6. Docker Desktop will download the required Kubernetes components and start a local single-node cluster (context: `docker-desktop`).
7. Verify in PowerShell / Command Prompt:
   ```powershell
   kubectl cluster-info
   kubectl get nodes
   ```
   *(You should see `docker-desktop` in `Ready` status).*

---

## Step 3: Install Required Jenkins Plugins
In Jenkins (`http://localhost:8080`):
1. Navigate to: **Manage Jenkins** -> **Plugins** -> **Available plugins**.
2. In the search box, search for and install:
   - `Docker`
   - `Docker Pipeline`
   - `Kubernetes CLI`
3. Click **Install without restart** (or check "Restart Jenkins when installation is complete").

---

## Step 4 & 5: Java Application & Maven Build (Pre-configured)
The application has already been created in your workspace under [`simple-java-app/`](file:///c:/Users/dell9/Downloads/-LivePDF/simple-java-app):

1. **Java Source Code**: [`simple-java-app/App.java`](file:///c:/Users/dell9/Downloads/-LivePDF/simple-java-app/App.java)
   ```java
   public class App {
       public static void main(String[] args) throws Exception {
           System.out.println("Java CI/CD Application Started...");
           while (true) {
               Thread.sleep(5000);
               System.out.println("Hello from Java CI/CD Pipeline!");
           }
       }
   }
   ```

2. **Maven Configuration**: [`simple-java-app/pom.xml`](file:///c:/Users/dell9/Downloads/-LivePDF/simple-java-app/pom.xml)
   - Configured with Java 17/21 compiler plugin.
   - Configured with `maven-jar-plugin` pointing to `mainClass: App`.

3. **Local Build Test**:
   ```powershell
   cd simple-java-app
   mvn clean package
   ```
   This generates `target/simple-java-app-1.0.jar`.

---

## Step 6: Dockerfile (Pre-configured)
File: [`simple-java-app/Dockerfile`](file:///c:/Users/dell9/Downloads/-LivePDF/simple-java-app/Dockerfile)
```dockerfile
FROM eclipse-temurin:17-jdk
WORKDIR /app
COPY target/simple-java-app-1.0.jar app.jar
CMD ["java", "-jar", "app.jar"]
```

---

## Step 7: Push Code to GitHub
Commit and push the new files to your repository:
```powershell
git add .
git commit -m "Add simple-java-app, Dockerfile, deployment.yaml, and Jenkinsfile for k8s demo"
git push origin main
```

---

## Step 8: Kubernetes Deployment File (Pre-configured)
File: [`deployment.yaml`](file:///c:/Users/dell9/Downloads/-LivePDF/deployment.yaml) (and [`simple-java-app/deployment.yaml`](file:///c:/Users/dell9/Downloads/-LivePDF/simple-java-app/deployment.yaml))
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: java-app
spec:
  replicas: 2
  selector:
    matchLabels:
      app: java-app
  template:
    metadata:
      labels:
        app: java-app
    spec:
      containers:
      - name: java-app
        image: kpchiragguptha/java-app:latest
---
apiVersion: v1
kind: Service
metadata:
  name: java-service
spec:
  type: NodePort
  selector:
    app: java-app
  ports:
  - port: 80
    targetPort: 8080
    nodePort: 30008
```

---

## Step 9 & 10: Configure Docker Hub Credentials in Jenkins
1. Open Jenkins and go to:
   **Manage Jenkins** -> **Credentials** -> **(System)** -> **Global credentials (unrestricted)** -> **Add Credentials**.
2. Fill in the fields:
   - **Kind**: `Username with password`
   - **Scope**: `Global`
   - **Username**: `kpchiragguptha` (your Docker Hub username)
   - **Password**: *Your Docker Hub password or Personal Access Token*
   - **ID**: `dockerhub-creds`  *(Must match the Jenkinsfile)*
   - **Description**: `DockerHub Login`
3. Click **Create**.

---

## Step 11: Create Jenkins Pipeline Job
1. In the Jenkins Dashboard, click **New Item**.
2. Enter Item Name: `Java-CICD`.
3. Select **Pipeline** and click **OK**.
4. Scroll down to the **Pipeline** section:
   - Set **Definition**: `Pipeline script`
   - Paste the following declarative script:

```groovy
pipeline {
    agent any

    environment {
        DOCKER_IMAGE = "kpchiragguptha/java-app:latest"
    }

    stages {
        stage('Clone Repository') {
            steps {
                git branch: 'main',
                    url: 'https://github.com/KPCHIRAGGUPTHA/-LivePDF.git'
            }
        }

        stage('Build with Maven') {
            steps {
                dir('simple-java-app') {
                    bat 'mvn clean package'
                }
            }
        }

        stage('Build Docker Image') {
            steps {
                dir('simple-java-app') {
                    bat "docker build -t %DOCKER_IMAGE% ."
                }
            }
        }

        stage('Push to DockerHub') {
            steps {
                withCredentials([usernamePassword(
                    credentialsId: 'dockerhub-creds',
                    usernameVariable: 'DOCKER_USER',
                    passwordVariable: 'DOCKER_PASS'
                )]) {
                    bat """
                    docker login -u %DOCKER_USER% -p %DOCKER_PASS%
                    docker push %DOCKER_IMAGE%
                    """
                }
            }
        }

        stage('Deploy to Kubernetes') {
            steps {
                bat 'kubectl apply -f deployment.yaml'
            }
        }
    }

    post {
        success {
            echo 'CI/CD Pipeline executed successfully!'
        }
        failure {
            echo 'Pipeline failed. Please check logs.'
        }
    }
}
```

5. Click **Save**.
6. Click **Build Now** to execute the pipeline.

---

## Step 12: Verify Docker & Kubernetes Deployment
Once Jenkins reports **Finished: SUCCESS**, verify your running cluster resources:

1. **Verify Services & NodePort**:
   ```powershell
   kubectl get svc
   ```
   *Expected output:*
   ```
   NAME           TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)        AGE
   java-service   NodePort    10.10x.xxx.xxx   <none>        80:30008/TCP   1m
   kubernetes     ClusterIP   10.96.0.1        <none>        443/TCP        1h
   ```

2. **Verify Pods (2 replicas running)**:
   ```powershell
   kubectl get pods -l app=java-app
   ```

3. **Verify Application Logs**:
   ```powershell
   kubectl logs -l app=java-app --tail=20
   ```
   *Output will show:*
   ```
   Java CI/CD Application Started...
   Hello from Java CI/CD Pipeline!
   ```

4. **Verify Docker Image**:
   Open Docker Desktop -> **Images** tab -> you will see `kpchiragguptha/java-app:latest`.
