var browserify = require('browserify');
var child_process = require('child_process');
var del = require('del');
var eslint = require('gulp-eslint');
var gulp = require('gulp');
var bowerNormalizer = require('gulp-bower-normalize');
var mainBowerFiles = require('main-bower-files');
var reactify = require('reactify');
var react = require('gulp-react');
var rename = require('gulp-rename');
var source = require('vinyl-source-stream');
var watch = require('gulp-watch');

// Use BowerFiles to install bower packages in a
// normalized directory structure.
function buildBowerFiles() {
    var stream = gulp.src(mainBowerFiles(),
                    {base: './bower_components'})
        .pipe(bowerNormalizer({bowerJson: './bower.json'}))
        .pipe(gulp.dest('./keepnote/server/static/thirdparty/'));

    stream.on('end', function () {
        var patcher = child_process.spawn('patch', [
            '-N',
            'keepnote/server/static/thirdparty/xmldom/js/dom.js',
            'setup/xmldom.patch'
        ]);
    });
}

gulp.task('lint', function () {
    return gulp.src(["js/*.js", "js/*.jsx"])
        .pipe(eslint({
            globals: {
                module: true,
                require: true,
                window: true
            }
        }))
        .pipe(eslint.format())
        .pipe(eslint.failOnError());
});

// Use Browserify to package all keepnote js code.
gulp.task('build-main', function() {
    browserify(['./js/exports.js'])
        .transform(reactify)
        .bundle()
        .pipe(source('keepnote-all.js'))
        .pipe(gulp.dest('./keepnote/server/static/js/'));
});

gulp.task("watch", function() {
    watch(['js/**/*.js', 'js/**/*.jsx'], function() {
        gulp.start('build-main');
    });
});

gulp.task('bower-files', buildBowerFiles);

gulp.task('clean', function (cb) {
    del([
        'keepnote/server/static/thirdparty/**',
        'keepnote/server/static/js/keepnote-all.js'
    ], cb);
});

gulp.task('default', ['bower-files', 'build-main']);
