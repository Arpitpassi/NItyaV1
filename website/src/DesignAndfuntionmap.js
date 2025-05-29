
    const body = document.body;
    const themeToggle = document.getElementById('theme-toggle');

    // Load theme from localStorage
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light-mode') {
      body.classList.add('light-mode');
      themeToggle.textContent = 'Dark Mode';
    } else {
      body.classList.remove('light-mode');
      themeToggle.textContent = 'Light Mode';
    }

    themeToggle.addEventListener('click', () => {
      if (body.classList.contains('light-mode')) {
        body.classList.remove('light-mode');
        themeToggle.textContent = 'Light Mode';
        localStorage.setItem('theme', 'dark-mode');
      } else {
        body.classList.add('light-mode');
        themeToggle.textContent = 'Dark Mode';
        localStorage.setItem('theme', 'light-mode');
      }
    });

    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', function(e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
          window.scrollTo({
            top: target.offsetTop,
            behavior: 'smooth'
          });
        }
      });
    });

    const container = document.getElementById('canvas-container');
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 20;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const sphereGeometry = new THREE.IcosahedronGeometry(5, 2);
    const wireframe = new THREE.WireframeGeometry(sphereGeometry);
    const material = new THREE.LineBasicMaterial({
      color: 0x63E7FF,
      transparent: true,
      opacity: 0.8
    });

    const wireSphere = new THREE.LineSegments(wireframe, material);
    scene.add(wireSphere);

    const particleCount = 1000;
    const positions = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 50;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 50;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 50;
      sizes[i] = Math.random() * 0.5;
    }

    const particlesGeometry = new THREE.BufferGeometry();
    particlesGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particlesGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const particlesMaterial = new THREE.PointsMaterial({
      color: 0xFF3EFF,
      size: 0.1,
      transparent: true,
      opacity: 0.6
    });

    const particles = new THREE.Points(particlesGeometry, particlesMaterial);
    scene.add(particles);

    let neuralNetworkNodes = [];
    let neuralNetworkLines = [];
    let isAnimatingNeuralNetwork = false;

    function createNeuralNetwork() {
      neuralNetworkNodes.forEach(node => scene.remove(node));
      neuralNetworkLines.forEach(line => scene.remove(line));
      neuralNetworkNodes = [];
      neuralNetworkLines = [];

      const nodeCount = 20;
      const nodeGeometry = new THREE.SphereGeometry(0.1, 8, 8);
      const nodeMaterial = new THREE.MeshBasicMaterial({ color: 0x63E7FF, transparent: true, opacity: 0 });

      for (let i = 0; i < nodeCount; i++) {
        const node = new THREE.Mesh(nodeGeometry, nodeMaterial.clone());
        node.position.set(
          (Math.random() - 0.5) * 10,
          (Math.random() - 0.5) * 10,
          (Math.random() - 0.5) * 10
        );
        scene.add(node);
        neuralNetworkNodes.push(node);
      }

      const lineMaterial = new THREE.LineBasicMaterial({ color: 0xFF3EFF, transparent: true, opacity: 0 });
      for (let i = 0; i < nodeCount; i++) {
        for (let j = i + 1; j < nodeCount; j++) {
          if (Math.random() < 0.2) {
            const points = [
              neuralNetworkNodes[i].position,
              neuralNetworkNodes[j].position
            ];
            const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
            const line = new THREE.Line(lineGeometry, lineMaterial.clone());
            scene.add(line);
            neuralNetworkLines.push(line);
          }
        }
      }
    }

    function animateNeuralNetwork(callback) {
      if (isAnimatingNeuralNetwork) return;
      isAnimatingNeuralNetwork = true;

      createNeuralNetwork();
      let animationTime = 0;
      const animationDuration = 3000;

      function updateNeuralNetwork() {
        animationTime += 16;
        const progress = animationTime / animationDuration;

        neuralNetworkNodes.forEach(node => {
          node.material.opacity = Math.min(progress, 1);
        });

        neuralNetworkLines.forEach((line, index) => {
          const lineProgress = (progress - (index / neuralNetworkLines.length) * 0.5) * 2;
          line.material.opacity = Math.max(0, Math.min(lineProgress, 1));
        });

        if (animationTime >= animationDuration) {
          neuralNetworkNodes.forEach(node => scene.remove(node));
          neuralNetworkLines.forEach(line => scene.remove(line));
          neuralNetworkNodes = [];
          neuralNetworkLines = [];
          isAnimatingNeuralNetwork = false;
          callback();
          return;
        }

        requestAnimationFrame(updateNeuralNetwork);
      }

      updateNeuralNetwork();
    }

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onResize);

    let scrollY = window.scrollY;
    window.addEventListener('scroll', () => {
      scrollY = window.scrollY;
    });

    let mouseX = 0, mouseY = 0;
    document.addEventListener('mousemove', (event) => {
      mouseX = (event.clientX / window.innerWidth) * 2 - 1;
      mouseY = -(event.clientY / window.innerHeight) * 2 + 1;
    });

    let animationId;
    function animate() {
      animationId = requestAnimationFrame(animate);

      wireSphere.rotation.x += 0.003;
      wireSphere.rotation.y += 0.005;

      particles.rotation.x += 0.0005;
      particles.rotation.y += 0.001;

      wireSphere.rotation.x += (mouseY * 0.2 - wireSphere.rotation.x) * 0.03;
      wireSphere.rotation.y += (mouseX * 0.2 - wireSphere.rotation.y) * 0.03;
      particles.rotation.x += (mouseY * 0.1 - particles.rotation.x) * 0.02;
      particles.rotation.y += (mouseX * 0.1 - particles.rotation.y) * 0.02;

      const scrollFactor = scrollY * 0.002;
      wireSphere.position.y = -scrollFactor * 2;
      particles.position.y = -scrollFactor;

      let wireColor, particleColor;
      if (body.classList.contains('light-mode')) {
        wireColor = 0x0088CC;
        particleColor = 0xCC00CC;
      } else {
        wireColor = 0x63E7FF;
        particleColor = 0xFF3EFF;
      }

      wireSphere.material.color.set(wireColor);
      particles.material.color.set(particleColor);

      neuralNetworkNodes.forEach(node => {
        node.material.color.set(wireColor);
      });
      neuralNetworkLines.forEach(line => {
        line.material.color.set(particleColor);
      });

      renderer.render(scene, camera);
    }

    animate();

    window.addEventListener('unload', () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
    });
  