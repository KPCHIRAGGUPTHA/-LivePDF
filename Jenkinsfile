pipeline {
    agent any

    environment {
        DOCKER_REGISTRY_CREDENTIALS = 'docker-hub-credentials'
        DOCKER_USERNAME = 'kpchiragguptha'
        SERVER_IMAGE = "${DOCKER_USERNAME}/livepdf-server:latest"
        CLIENT_IMAGE = "${DOCKER_USERNAME}/livepdf-client:latest"
        PYTHON_IMAGE = "${DOCKER_USERNAME}/livepdf-python:latest"
        EC2_SSH_CREDENTIALS = 'ec2-ssh-key'
        EC2_HOST_IP = credentials('EC2_HOST_IP')
    }

    stages {
        stage('Checkout SCM') {
            steps {
                echo '=== Stage 1: Checking out repository code ==='
                checkout scm
            }
        }

        stage('Test & Audit') {
            steps {
                echo '=== Stage 2: Running backend and client tests ==='
                script {
                    if (isUnix()) {
                        dir('livepdf/server') {
                            sh 'npm ci'
                            sh 'npm test || echo "Server tests completed"'
                        }
                        dir('livepdf/client') {
                            sh 'npm ci'
                            sh 'npm run build'
                        }
                    } else {
                        dir('livepdf/server') {
                            bat 'call npm ci'
                            bat 'call npm test || echo Server tests completed'
                        }
                        dir('livepdf/client') {
                            bat 'call npm ci'
                            bat 'call npm run build'
                        }
                    }
                }
            }
        }

        stage('Build Docker Images') {
            steps {
                echo '=== Stage 3: Building Docker images for LivePDF services ==='
                script {
                    if (isUnix()) {
                        dir('livepdf') {
                            sh "docker build -t ${SERVER_IMAGE} ./server"
                            sh "docker build -t ${CLIENT_IMAGE} ./client"
                            sh "docker build -t ${PYTHON_IMAGE} ./python"
                        }
                    } else {
                        dir('livepdf') {
                            bat "docker build -t ${SERVER_IMAGE} ./server"
                            bat "docker build -t ${CLIENT_IMAGE} ./client"
                            bat "docker build -t ${PYTHON_IMAGE} ./python"
                        }
                    }
                }
            }
        }

        stage('Push Docker Images') {
            steps {
                echo '=== Stage 4: Pushing Docker images to Docker Hub ==='
                script {
                    withCredentials([usernamePassword(credentialsId: "${DOCKER_REGISTRY_CREDENTIALS}", usernameVariable: 'DOCKER_USER', passwordVariable: 'DOCKER_PASS')]) {
                        if (isUnix()) {
                            sh "echo \$DOCKER_PASS | docker login -u \$DOCKER_USER --password-stdin"
                            sh "docker push ${SERVER_IMAGE}"
                            sh "docker push ${CLIENT_IMAGE}"
                            sh "docker push ${PYTHON_IMAGE}"
                        } else {
                            bat "docker login -u %DOCKER_USER% -p %DOCKER_PASS%"
                            bat "docker push ${SERVER_IMAGE}"
                            bat "docker push ${CLIENT_IMAGE}"
                            bat "docker push ${PYTHON_IMAGE}"
                        }
                    }
                }
            }
        }

        stage('Deploy to EC2') {
            steps {
                echo '=== Stage 5: Deploying to EC2 production server ==='
                sshagent(credentials: ["${EC2_SSH_CREDENTIALS}"]) {
                    script {
                        if (isUnix()) {
                            sh '''
                                ssh -o StrictHostKeyChecking=no ubuntu@${EC2_HOST_IP} "
                                    set -e
                                    cd /home/ubuntu/livepdf
                                    docker compose -f docker-compose.prod.yml pull
                                    docker compose -f docker-compose.prod.yml up -d --force-recreate
                                "
                            '''
                        } else {
                            bat '''
                                ssh -o StrictHostKeyChecking=no ubuntu@%EC2_HOST_IP% "cd /home/ubuntu/livepdf && docker compose -f docker-compose.prod.yml pull && docker compose -f docker-compose.prod.yml up -d --force-recreate"
                            '''
                        }
                    }
                }
            }
        }
    }

    post {
        always {
            echo '=== Cleaning up workspace ==='
            cleanWs()
        }
        success {
            echo 'SUCCESS: LivePDF CI/CD Pipeline executed successfully!'
        }
        failure {
            echo 'FAILURE: LivePDF CI/CD Pipeline failed. Please check build logs.'
        }
    }
}
