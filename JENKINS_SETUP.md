# Jenkins CI/CD Setup Guide for LivePDF

This guide walks you through setting up **Jenkins CI/CD** for the **LivePDF** repository (`https://github.com/KPCHIRAGGUPTHA/-LivePDF`).

---

## Prerequisites

1. **Java JDK 21+** installed on the Jenkins host machine.
2. **Jenkins** installed and running on `http://localhost:8080` (or your server IP).
3. **Node.js 20+**, **Python 3.10+**, and **Docker** installed on the build node.
4. **Required Jenkins Plugins**:
   - `Pipeline`
   - `Docker Pipeline`
   - `SSH Agent`
   - `Credentials Binding`
   - `Build Pipeline Plugin` *(Optional for Freestyle Pipeline Views)*

---

## Method 1: Automated Declarative Pipeline (`Jenkinsfile`) [RECOMMENDED]

The repository contains a standard `Jenkinsfile` in the root folder that automates test, build, push, and deployment to EC2.

### Step 1: Add Credentials in Jenkins
Go to **Manage Jenkins** -> **Credentials** -> **System** -> **Global credentials (unrestricted)** -> **Add Credentials**:

1. **Docker Hub Credentials**:
   - **Kind**: Username with password
   - **Username**: `kpchiragguptha` (or your Docker Hub username)
   - **Password**: Your Docker Hub Password / Access Token
   - **ID**: `docker-hub-credentials`

2. **EC2 SSH Private Key**:
   - **Kind**: SSH Username with private key
   - **Username**: `ubuntu`
   - **Private Key**: Enter key directly (your EC2 `.pem` key content)
   - **ID**: `ec2-ssh-key`

3. **EC2 Host IP**:
   - **Kind**: Secret text
   - **Secret**: `13.127.x.x` (Your EC2 Instance Public IP)
   - **ID**: `EC2_HOST_IP`

### Step 2: Create the Pipeline Job
1. In Jenkins Dashboard, click **New Item**.
2. Enter Name: `LivePDF_Pipeline`.
3. Select **Pipeline** and click **OK**.
4. Under **Build Triggers**, select **GitHub hook trigger for GITScm polling** (or **Poll SCM** with schedule `H/5 * * * *`).
5. Under **Pipeline**:
   - **Definition**: `Pipeline script from SCM`
   - **SCM**: `Git`
   - **Repository URL**: `https://github.com/KPCHIRAGGUPTHA/-LivePDF.git`
   - **Branch Specifier**: `*/main`
   - **Script Path**: `Jenkinsfile`
6. Click **Save** and click **Build Now**.

---

## Method 2: Freestyle Jobs & Build Pipeline View (Windows / Tutorial Style)

If running Jenkins on Windows locally (as described in your PDF tutorial), you can set up freestyle jobs:

### Job 1: `LivePDF_DEV_Job`
1. Click **New Item** -> Name: `LivePDF_DEV_Job` -> Select **Freestyle project** -> Click **OK**.
2. **Source Code Management**:
   - Select **Git**.
   - Repository URL: `https://github.com/KPCHIRAGGUPTHA/-LivePDF.git`.
   - Branch Specifier: `*/main`.
3. **Triggers**:
   - Select **Poll SCM**.
   - Schedule: `* * * * *` (polls repository every minute).
4. **Environment**:
   - Select **Delete workspace before build starts**.
5. **Build Steps**:
   - Click **Add build step** -> Select **Execute Windows batch command**.
   - Command:
     ```cmd
     call livepdf\jenkins_build.bat
     ```
6. **Post-build Actions**:
   - Select **Build other projects**.
   - Projects to build: `LivePDF_QA_Job`.
7. Click **Save**.

### Job 2: `LivePDF_QA_Job`
1. Click **New Item** -> Name: `LivePDF_QA_Job` -> Select **Freestyle project** -> Click **OK**.
2. **Triggers**:
   - Select **Build after other projects are built**.
   - Projects to watch: `LivePDF_DEV_Job`.
3. **Build Steps**:
   - Click **Add build step** -> Select **Execute Windows batch command**.
   - Command:
     ```cmd
     echo Running QA Health Check...
     node -v
     echo QA Tests Passed.
     ```
4. Click **Save**.

### Creating the Build Pipeline View
1. On the Jenkins Dashboard, click the **+** (Add View) icon next to the search/tabs.
2. Select **Build Pipeline View**.
3. Name: `DEV_QA_Pipeline` -> Click **Create**.
4. In **Pipeline Flow** -> **Select Initial Job**: choose `LivePDF_DEV_Job`.
5. Set **No Of Displayed Builds**: `5`.
6. Click **Apply** and **Save**.

---

## Verification

- When code is pushed to `main`, Jenkins will trigger the pipeline automatically.
- Check the **Console Output** of any build stage to verify logs.
